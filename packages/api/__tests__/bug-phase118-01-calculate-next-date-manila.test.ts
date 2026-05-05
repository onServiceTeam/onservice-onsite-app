// BUG-PHASE118-01 — calculateNextDate() in recurring.service did
// weekday/month math using server-local TZ (setHours(0,0,0,0) +
// getDay/getDate/setDate/setMonth/getMonth all device-local).
//
// Server runs UTC (no `TZ=Asia/Manila` set in docker-compose), so
// the function's "today" was UTC's today. Between 16:00–23:59 UTC,
// Manila is already on the next calendar day — server still sees
// the previous day. Concrete bug: customer creates a "weekly
// Thursday" recurring at 01:00 Manila Thursday (= 17:00 UTC
// Wednesday). Server computes next-Thursday = today UTC + 1 day =
// today Manila — schedules the FIRST instance for the SAME Manila
// day the customer is already in. Customer expected "next Thursday"
// to mean a week from today. Same off-by-one applies to bi_weekly
// (would be one week early) and monthly (could land in current
// month instead of next).
//
// Same Manila-tz pattern as Phase 113 (recurring cron) and Phase
// 117 (slot waitlist). Fix anchors the math to Manila calendar day:
// `result` is built as UTC midnight of the Manila day, then UTC
// methods are used throughout (Manila is +08:00 with no DST, so
// UTC arithmetic on a Manila-anchored UTC-midnight Date is
// equivalent to Manila arithmetic). result.toISOString().split('T')[0]
// in callers therefore returns the Manila YYYY-MM-DD they expect
// without further conversion.

import { readFileSync } from 'fs';
import { resolve } from 'path';

const RECURRING = readFileSync(
  resolve(__dirname, '../src/services/recurring.service.ts'),
  'utf8',
);

describe('BUG-PHASE118-01 — calculateNextDate uses Manila day, not server-local UTC', () => {
  it('BUG-PHASE118-01 — pre-fix `result.setHours(0, 0, 0, 0)` is gone (was the device-local midnight anchor)', () => {
    expect(RECURRING).not.toMatch(/result\.setHours\(0, 0, 0, 0\);/);
  });

  it('BUG-PHASE118-01 — manilaDateStr extracted via toLocaleDateString with Asia/Manila', () => {
    expect(RECURRING).toMatch(
      /const manilaDateStr = ref\.toLocaleDateString\('en-CA', \{ timeZone: 'Asia\/Manila' \}\);/,
    );
  });

  it('BUG-PHASE118-01 — result anchored to UTC-midnight of the Manila day', () => {
    expect(RECURRING).toMatch(
      /const result = new Date\(`\$\{manilaDateStr\}T00:00:00Z`\);/,
    );
  });

  it('BUG-PHASE118-01 — manilaDay derived via getUTCDay (so callers do not pick up server-local weekday)', () => {
    expect(RECURRING).toMatch(/const manilaDay = result\.getUTCDay\(\);/);
  });

  it('BUG-PHASE118-01 — weekly + bi_weekly use UTC methods + manilaDay (not setDate/getDay)', () => {
    expect(RECURRING).toMatch(/result\.setUTCDate\(result\.getUTCDate\(\) \+ offset\);/);
    expect(RECURRING).toMatch(/result\.setUTCDate\(result\.getUTCDate\(\) \+ offset \+ 7\);/);
    // The pre-fix `result.getDay()` literal in the offset expression must be gone.
    expect(RECURRING).not.toMatch(/\(\(7 \+ preferredDay - result\.getDay\(\)\) % 7 \|\| 7\)/);
  });

  it('BUG-PHASE118-01 — monthly uses setUTCDate / setUTCMonth / getUTCMonth / getUTCDay', () => {
    expect(RECURRING).toMatch(/result\.setUTCDate\(1\);/);
    expect(RECURRING).toMatch(/result\.setUTCMonth\(result\.getUTCMonth\(\) \+ 1\);/);
    expect(RECURRING).toMatch(/result\.getUTCDay\(\) !== preferredDay/);
  });

  it('BUG-PHASE118-01 — fromDate optional parameter still works (regression guard)', () => {
    // Used by skipNextOccurrence + the cron's "advance after creating".
    expect(RECURRING).toMatch(/function calculateNextDate\(frequency: string, preferredDay: number, fromDate\?: Date\): Date \{/);
    expect(RECURRING).toMatch(/const ref = fromDate \?\? new Date\(\);/);
  });
});
