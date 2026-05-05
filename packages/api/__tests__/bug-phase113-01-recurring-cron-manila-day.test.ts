// BUG-PHASE113-01 — recurring cron compared next_booking_date to UTC.
//
// Pre-fix `processRecurringBookings` set:
//   const today = new Date().toISOString().split('T')[0]!;
//
// `today` is the UTC date. The cron then compared it to
// `rb.next_booking_date <= $1`, where next_booking_date is populated
// from a Manila YYYY-MM-DD (instances are scheduled at
// `${next_booking_date}T${preferred_time}+08:00`).
//
// For an early-morning Manila booking — say a recurring 06:00 on the
// 5th, which is 22:00 UTC on the 4th — the cron had to wait until
// UTC ticked over to the 5th. UTC midnight 5th = 08:00 Manila 5th,
// so the booking was created TWO HOURS after its preferred time, and
// the auto-charge attempt fired late. For a 02:00 Manila booking
// (some maintenance services run overnight), the lateness was up to
// six hours. Customers using auto-charge saw "your card was charged
// at 09:00 for the 06:00 service" — confusing.
//
// Same Manila-tz pattern as Phase 105 (provider calendar) and Phase
// 109 (make-recurring default day). Fix anchors `today` to Manila.

import { readFileSync } from 'fs';
import { resolve } from 'path';

const RECURRING = readFileSync(
  resolve(__dirname, '../src/services/recurring.service.ts'),
  'utf8',
);

describe('BUG-PHASE113-01 — recurring cron uses Manila day, not UTC', () => {
  it('BUG-PHASE113-01 — `today` is computed via Asia/Manila toLocaleDateString', () => {
    expect(RECURRING).toMatch(
      /const today = new Date\(\)\.toLocaleDateString\('en-CA', \{ timeZone: 'Asia\/Manila' \}\);/,
    );
  });

  it('BUG-PHASE113-01 — pre-fix `new Date().toISOString().split("T")[0]` `today` line is gone', () => {
    expect(RECURRING).not.toMatch(/const today = new Date\(\)\.toISOString\(\)\.split\('T'\)\[0\]!;/);
  });

  it('BUG-PHASE113-01 — scheduledAt still constructed with +08:00 Manila offset (regression guard)', () => {
    expect(RECURRING).toMatch(
      /const scheduledAt = new Date\(`\$\{rb\.next_booking_date\}T\$\{rb\.preferred_time\}\+08:00`\);/,
    );
  });

  it('BUG-PHASE113-01 — cron still filters by status=active + is_active customer (regression guard)', () => {
    expect(RECURRING).toMatch(/rb\.status = 'active'/);
    expect(RECURRING).toMatch(/u\.is_active = TRUE/);
  });
});
