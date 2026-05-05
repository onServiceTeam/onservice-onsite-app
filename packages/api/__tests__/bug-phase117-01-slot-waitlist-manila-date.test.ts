// BUG-PHASE117-01 — booking.service used the UTC date of
// scheduled_at when notifying slot waitlist after a cancellation:
//
//   const dateStr = updated.scheduled_at.toISOString().split('T')[0]!;
//   slotWaitlistService.processSlotAvailability(
//     updated.category_id, updated.city, dateStr,
//   );
//
// But slot_waitlist.preferred_date is a Manila YYYY-MM-DD — the date
// the customer asked for in their local context. So when an early-
// morning Manila booking was cancelled (e.g. 06:00 Manila May 5 =
// 22:00 UTC May 4), the cron looked up waitlist rows for "2026-05-04"
// instead of "2026-05-05". Customers waitlisted for May 4 got
// notifications for a slot that opened up on May 5 — wrong day.
//
// Same Manila-tz pattern as Phase 105 (provider calendar), Phase 113
// (recurring cron), Phase 115 (promo validUntil), Phase 116 (consent
// effective date). Anchor the conversion to Asia/Manila so the
// lookup matches the waitlist's storage convention.

import { readFileSync } from 'fs';
import { resolve } from 'path';

const BOOKING = readFileSync(
  resolve(__dirname, '../src/services/booking.service.ts'),
  'utf8',
);

describe('BUG-PHASE117-01 — slot-waitlist cancellation lookup uses Manila day', () => {
  it('BUG-PHASE117-01 — dateStr derived via toLocaleDateString with Asia/Manila', () => {
    expect(BOOKING).toMatch(
      /const dateStr = updated\.scheduled_at\.toLocaleDateString\('en-CA', \{ timeZone: 'Asia\/Manila' \}\);/,
    );
  });

  it('BUG-PHASE117-01 — pre-fix toISOString().split("T")[0] dateStr line is gone', () => {
    expect(BOOKING).not.toMatch(/const dateStr = updated\.scheduled_at\.toISOString\(\)\.split\('T'\)\[0\]!;/);
  });

  it('BUG-PHASE117-01 — call still routes to processSlotAvailability with category_id + city + dateStr (regression guard)', () => {
    expect(BOOKING).toMatch(
      /slotWaitlistService\.processSlotAvailability\([\s\S]+updated\.category_id,[\s\S]+updated\.city,[\s\S]+dateStr,\s*\)/,
    );
  });

  it('BUG-PHASE117-01 — gate still checks both cancellation kinds (regression guard)', () => {
    expect(BOOKING).toMatch(
      /if \(newStatus === 'cancelled_by_provider' \|\| newStatus === 'cancelled_by_admin'\) \{/,
    );
  });
});
