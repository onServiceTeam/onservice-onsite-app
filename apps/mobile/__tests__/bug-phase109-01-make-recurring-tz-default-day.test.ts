// BUG-PHASE109-01 — make-recurring's preferred-day default extracted
// the weekday via `.getDay()` on the booking's scheduledAt Date. That
// method returns the DEVICE-LOCAL weekday, not Manila's. For a booking
// scheduled at, say, 1:30 AM Thursday Manila (which is 17:30 UTC
// Wednesday), a customer's device set to a UTC-12 timezone interpreted
// the same timestamp as 05:30 UTC-12 Wednesday — getDay() returned 3
// (Wed). The screen then defaulted the recurring schedule to Wednesday,
// the wrong day. Same Manila-tz pattern as Phase 105's provider
// calendar fix.
//
// Fix: extract the weekday in Manila timezone via toLocaleDateString
// with `{ timeZone: 'Asia/Manila', weekday: 'short' }`, then map the
// 'Sun'/'Mon'/.../'Sat' string to the index used by the chip row.

import { readFileSync } from 'fs';
import { resolve } from 'path';

const MAKE_RECURRING = readFileSync(
  resolve(__dirname, '../app/customer/booking/make-recurring.tsx'),
  'utf8',
);

describe('BUG-PHASE109-01 — make-recurring default-day computed in Manila TZ, not device-local', () => {
  it('BUG-PHASE109-01 — pre-fix `new Date(booking.scheduledAt).getDay()` is gone', () => {
    expect(MAKE_RECURRING).not.toMatch(/const originalDay = new Date\(booking\.scheduledAt\)\.getDay\(\)/);
  });

  it('BUG-PHASE109-01 — manila weekday is extracted via toLocaleDateString with Asia/Manila timeZone', () => {
    expect(MAKE_RECURRING).toMatch(
      /toLocaleDateString\('en-US', \{[\s\S]*timeZone: 'Asia\/Manila',[\s\S]*weekday: 'short',?[\s\S]*\}\)/,
    );
  });

  it('BUG-PHASE109-01 — manila weekday mapped to 0..6 via the same Sun..Sat array used by the chip row', () => {
    expect(MAKE_RECURRING).toMatch(
      /\['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'\]\.indexOf\(manilaWeekday\)/,
    );
  });

  it('BUG-PHASE109-01 — guards against indexOf returning -1 (locale string mismatch) before calling setPreferredDay', () => {
    expect(MAKE_RECURRING).toMatch(/if \(dayIndex >= 0\) setPreferredDay\(dayIndex\)/);
  });

  it('BUG-PHASE109-01 — dayTouched gate still in place so manual user pick wins (regression guard)', () => {
    expect(MAKE_RECURRING).toMatch(/if \(!booking\?\.scheduledAt \|\| dayTouched\) return/);
  });
});
