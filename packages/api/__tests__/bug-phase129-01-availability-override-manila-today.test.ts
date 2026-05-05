// BUG-PHASE129-01 — availabilityOverrideSchema's "not in the past" refine
// used `new Date().getUTCFullYear/Month/Date` to compute today, which
// produces UTC-today, NOT Manila-today.
//
// Manila (Asia/Manila) is UTC+08:00 with no DST. There's an 8-hour
// window each day — between 00:00 Manila (= 16:00 UTC of the previous
// calendar day) and 08:00 Manila (= 00:00 UTC) — when Manila and UTC
// disagree by one calendar day. During that window, a provider on a
// Manila device submitting `overrideDate: <yesterday-Manila>` (which is
// today in UTC) would compare `<yesterday-Manila> >= <UTC-today, which
// is still-yesterday-Manila>` → TRUE → the validator accepts a date
// that's genuinely in the past in the launch market.
//
// Same Manila TZ correction shape as Phases 109 (booking
// make-recurring), 113 (recurring.service), 117 (slot-waitlist date),
// 119 (matching weekday/time), 122/123 (provider-tools), 124 (admin
// analytics) — all anchored on `(now()).toLocaleDateString('en-CA',
// { timeZone: 'Asia/Manila' })`.
//
// Test strategy: stub `Date` at instants where Manila and UTC disagree,
// then prove the schema rejects yesterday-in-Manila and accepts
// today-in-Manila.

import { availabilityOverrideSchema } from '../src/validators/provider.validators';

describe('BUG-PHASE129-01 — availabilityOverrideSchema uses Manila-today, not UTC-today', () => {
  let RealDate: DateConstructor;

  beforeAll(() => {
    RealDate = global.Date;
  });

  afterEach(() => {
    global.Date = RealDate;
  });

  function freezeAt(instant: Date) {
    const Frozen = class extends RealDate {
      constructor(...args: ConstructorParameters<typeof RealDate>) {
        if (args.length === 0) {
          super(instant.getTime());
        } else {
          // @ts-expect-error variadic forwarding
          super(...args);
        }
      }
      static now() {
        return instant.getTime();
      }
    } as unknown as DateConstructor;
    global.Date = Frozen;
  }

  describe('boundary: 03:00 Manila on 2026-05-06 (= 19:00 UTC on 2026-05-05)', () => {
    // Manila day = 2026-05-06; UTC day = 2026-05-05.
    // Pre-fix: validator computed today=2026-05-05 (UTC) and would
    // accept overrideDate='2026-05-05' (yesterday in Manila).
    // Post-fix: validator computes today=2026-05-06 (Manila) and
    // rejects '2026-05-05' as past.
    beforeEach(() => {
      freezeAt(new Date('2026-05-05T19:00:00Z'));
    });

    it('rejects 2026-05-05 (yesterday in Manila, today in UTC)', () => {
      const out = availabilityOverrideSchema.safeParse({
        overrideDate: '2026-05-05',
        isAvailable: false,
        reason: 'Sick',
      });
      expect(out.success).toBe(false);
      if (!out.success) {
        expect(out.error.issues.some((i) => /past/.test(i.message))).toBe(true);
      }
    });

    it('accepts 2026-05-06 (today in Manila)', () => {
      const out = availabilityOverrideSchema.safeParse({
        overrideDate: '2026-05-06',
        isAvailable: false,
        reason: 'Family event',
      });
      expect(out.success).toBe(true);
    });

    it('accepts 2026-05-07 (tomorrow in Manila)', () => {
      const out = availabilityOverrideSchema.safeParse({
        overrideDate: '2026-05-07',
        isAvailable: false,
        reason: 'Vacation',
      });
      expect(out.success).toBe(true);
    });
  });

  describe('boundary: 23:30 Manila on 2026-05-06 (= 15:30 UTC on 2026-05-06)', () => {
    // Manila and UTC agree on day = 2026-05-06.
    beforeEach(() => {
      freezeAt(new Date('2026-05-06T15:30:00Z'));
    });

    it('rejects 2026-05-05 (yesterday in both)', () => {
      const out = availabilityOverrideSchema.safeParse({
        overrideDate: '2026-05-05',
        isAvailable: false,
      });
      expect(out.success).toBe(false);
    });

    it('accepts 2026-05-06 (today in both)', () => {
      const out = availabilityOverrideSchema.safeParse({
        overrideDate: '2026-05-06',
        isAvailable: false,
      });
      expect(out.success).toBe(true);
    });
  });

  describe('boundary: 00:30 Manila on 2026-05-07 (= 16:30 UTC on 2026-05-06)', () => {
    // Manila day = 2026-05-07; UTC day = 2026-05-06.
    // Pre-fix: validator accepted '2026-05-06' (UTC's today, which
    // is yesterday in Manila).
    beforeEach(() => {
      freezeAt(new Date('2026-05-06T16:30:00Z'));
    });

    it('rejects 2026-05-06 (yesterday in Manila, today in UTC)', () => {
      const out = availabilityOverrideSchema.safeParse({
        overrideDate: '2026-05-06',
        isAvailable: false,
      });
      expect(out.success).toBe(false);
    });

    it('accepts 2026-05-07 (today in Manila)', () => {
      const out = availabilityOverrideSchema.safeParse({
        overrideDate: '2026-05-07',
        isAvailable: false,
      });
      expect(out.success).toBe(true);
    });
  });
});
