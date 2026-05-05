// BUG-PHASE124-01 — follow-on to Phase 123 cleaning up the last two
// CURRENT_DATE leakage points in the API:
//
// 1. pricing.service.ts getUpcomingHolidays — `holiday_date >=
//    CURRENT_DATE` listed yesterday-Manila holidays as "upcoming"
//    during the 16:00–23:59 UTC window (= 00:00–07:59 Manila next
//    day). Stale "upcoming holidays" for ~8 hours after each holiday
//    actually passed.
//
// 2. admin-analytics.service.ts NBI expiry alert — `BETWEEN
//    CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'` had the same
//    8-hour shift. An NBI clearance expiring "today Manila" appeared
//    in the alert 8 hours late. For provider-onboarding compliance
//    (NBI = National Bureau of Investigation; expired clearances
//    must be renewed before new jobs are accepted per LAUNCH-
//    LIMITATIONS), the staleness matters at the day-boundary edge.
//
// Same Manila-tz family as Phase 123. Both fixed by replacing
// CURRENT_DATE with `(now() AT TIME ZONE 'Asia/Manila')::date`,
// which returns Manila's calendar day regardless of session TZ.

import { readFileSync } from 'fs';
import { resolve } from 'path';

const PRICING = readFileSync(
  resolve(__dirname, '../src/services/pricing.service.ts'),
  'utf8',
);
const ANALYTICS = readFileSync(
  resolve(__dirname, '../src/services/admin-analytics.service.ts'),
  'utf8',
);

describe('BUG-PHASE124-01 — pricing + NBI expiry SQL anchored to Manila day', () => {
  describe('pricing.service getUpcomingHolidays', () => {
    it('BUG-PHASE124-01 — pre-fix `holiday_date >= CURRENT_DATE` is gone', () => {
      // The fix block is the BETWEEN clause — make sure CURRENT_DATE
      // doesn't appear in the holidays query body.
      const fnBody = PRICING.match(/export async function getUpcomingHolidays[\s\S]+?\n\}/);
      expect(fnBody).not.toBeNull();
      expect(fnBody?.[0]).not.toMatch(/holiday_date >= CURRENT_DATE/);
      expect(fnBody?.[0]).not.toMatch(/holiday_date <= CURRENT_DATE \+ INTERVAL '1 day' \* \$1/);
    });

    it('BUG-PHASE124-01 — both BETWEEN bounds use the Manila-anchored expression', () => {
      const fnBody = PRICING.match(/export async function getUpcomingHolidays[\s\S]+?\n\}/)![0];
      expect(fnBody).toMatch(
        /holiday_date >= \(now\(\) AT TIME ZONE 'Asia\/Manila'\)::date/,
      );
      expect(fnBody).toMatch(
        /holiday_date <= \(now\(\) AT TIME ZONE 'Asia\/Manila'\)::date \+ INTERVAL '1 day' \* \$1/,
      );
    });
  });

  describe('admin-analytics.service NBI expiry alert', () => {
    it('BUG-PHASE124-01 — pre-fix `BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL` is gone', () => {
      expect(ANALYTICS).not.toMatch(/p\.nbi_expiry_date BETWEEN CURRENT_DATE AND CURRENT_DATE \+ INTERVAL '7 days'/);
    });

    it('BUG-PHASE124-01 — NBI BETWEEN both bounds use the Manila-anchored expression', () => {
      expect(ANALYTICS).toMatch(
        /p\.nbi_expiry_date BETWEEN \(now\(\) AT TIME ZONE 'Asia\/Manila'\)::date AND \(now\(\) AT TIME ZONE 'Asia\/Manila'\)::date \+ INTERVAL '7 days'/,
      );
    });
  });
});
