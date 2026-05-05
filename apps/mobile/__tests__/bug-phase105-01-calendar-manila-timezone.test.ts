// BUG-PHASE105-01 — provider calendar had two timezone defects at
// month boundaries because the from/to range was UTC-anchored and
// toDateKey binned by device timezone:
//
//   1. Pre-fix: `from + 'T00:00:00Z'` and `to + 'T23:59:59Z'`. For
//      Manila (UTC+8) the Manila-day-1 starts at 16:00 UTC of the
//      previous day. So jobs at 00:00–07:59 Manila on the 1st of
//      the month (which are 16:00–23:59 UTC of the last day of the
//      previous month) fell OUTSIDE the from-anchor and the
//      provider's calendar dropped them silently. A 6 AM appointment
//      on May 1 was simply invisible.
//
//   2. Pre-fix: `toDateKey` used `d.getFullYear() / getMonth() / getDate()`,
//      which return device-local values. On a Filipino traveling
//      abroad (or QA/staging on UTC), a job near midnight Manila
//      landed on the wrong calendar cell (off by one day). Jobs from
//      00:00 Manila on the 1st of the next month also leaked into
//      the current view (their UTC instant ~16:00 UTC of the last
//      day was still inside the to-anchor).
//
// Fix: anchor from/to to Manila offset (+08:00) so the queried UTC
// window genuinely covers the Manila month edge-to-edge, and bin
// scheduledAt timestamps via Asia/Manila with toLocaleDateString
// (en-CA gives YYYY-MM-DD identical to the pre-fix shape).

import { readFileSync } from 'fs';
import { resolve } from 'path';

const CALENDAR = readFileSync(
  resolve(__dirname, '../app/provider/calendar.tsx'),
  'utf8',
);

describe('BUG-PHASE105-01 — provider calendar binned by Manila day, not UTC / device', () => {
  it('BUG-PHASE105-01 — getMonthRange uses +08:00 Manila offset, not Z (UTC)', () => {
    expect(CALENDAR).toMatch(/T00:00:00\+08:00/);
    expect(CALENDAR).toMatch(/T23:59:59\+08:00/);
  });

  it('BUG-PHASE105-01 — pre-fix UTC Z anchors are gone', () => {
    expect(CALENDAR).not.toMatch(/from \+ 'T00:00:00Z'/);
    expect(CALENDAR).not.toMatch(/to \+ 'T23:59:59Z'/);
  });

  it('BUG-PHASE105-01 — toDateKey delegates to toLocaleDateString with Asia/Manila timeZone', () => {
    expect(CALENDAR).toMatch(/d\.toLocaleDateString\('en-CA', \{ timeZone: 'Asia\/Manila' \}\)/);
  });

  it('BUG-PHASE105-01 — pre-fix device-local getFullYear/getMonth/getDate is gone from toDateKey', () => {
    // The function should no longer manually concat year/month/date.
    expect(CALENDAR).not.toMatch(/\$\{d\.getFullYear\(\)\}-\$\{String\(d\.getMonth/);
  });
});
