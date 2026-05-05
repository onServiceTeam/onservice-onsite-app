// BUG-PHASE123-01 — Postgres CURRENT_DATE / DATE_TRUNC(..., CURRENT_DATE)
// returns/anchors to the session timezone, which is UTC in our pool
// (no `SET TIME ZONE 'Asia/Manila'` on the connection event). Three
// services anchored their "today" / "this week" / "this month"
// boundaries to CURRENT_DATE, so for 8 hours every day (16:00–23:59
// UTC = 00:00–07:59 Manila next day) the dashboards showed the
// previous Manila day's totals while the user's wall clock said
// "today":
//
// 1. provider-tools.service.ts getEarningsSummary — provider's
//    "Earned Today" / "Earned This Week" / "Earned This Month" +
//    matching job counts.
// 2. admin.service.ts getDashboardKpis — admin "Today's Revenue" +
//    "New Signups Today" + "Bookings Today."
// 3. metrics.service.ts — internal "Completed Today" / "Cancelled
//    Today" / "Payments Today" / "Revenue Today" stats fed to
//    Prometheus + admin overlays.
//
// Same Manila-tz family as Phases 105/113/118/119/120/121, but on
// the Postgres side rather than Node side. Fix expression:
//
//   (now() AT TIME ZONE 'Asia/Manila')::date AT TIME ZONE 'Asia/Manila'
//
// — for "midnight today Manila" as a UTC instant suitable for
// `created_at >= ...` / `updated_at >= ...` / `confirmed_at >= ...`
// comparisons against `timestamp without time zone` columns
// (which are stored UTC).
//
// For week/month boundaries:
//
//   DATE_TRUNC('week', now() AT TIME ZONE 'Asia/Manila') AT TIME ZONE 'Asia/Manila'
//
// — truncate Manila wall-clock first, then convert back to UTC.

import { readFileSync } from 'fs';
import { resolve } from 'path';

const PROVIDER_TOOLS = readFileSync(
  resolve(__dirname, '../src/services/provider-tools.service.ts'),
  'utf8',
);
const ADMIN = readFileSync(
  resolve(__dirname, '../src/services/admin.service.ts'),
  'utf8',
);
const METRICS = readFileSync(
  resolve(__dirname, '../src/services/metrics.service.ts'),
  'utf8',
);

describe('BUG-PHASE123-01 — today/week/month SQL boundaries anchored to Manila', () => {
  describe('provider-tools.service.ts getEarningsSummary', () => {
    it('BUG-PHASE123-01 — pre-fix `>= CURRENT_DATE` lines are gone from getEarningsSummary', () => {
      // Bound the search to the getEarningsSummary function body.
      const fnBody = PROVIDER_TOOLS.match(/export async function getEarningsSummary[\s\S]+?\n\}/);
      expect(fnBody).not.toBeNull();
      expect(fnBody?.[0]).not.toMatch(/CURRENT_DATE/);
    });

    it('BUG-PHASE123-01 — daily boundaries use Manila-anchored UTC instant', () => {
      const dailyMatches = PROVIDER_TOOLS.match(
        /\(now\(\) AT TIME ZONE 'Asia\/Manila'\)::date AT TIME ZONE 'Asia\/Manila'/g,
      );
      // Two daily case statements (earned_today + total_jobs_today).
      expect(dailyMatches?.length ?? 0).toBeGreaterThanOrEqual(2);
    });

    it('BUG-PHASE123-01 — week + month DATE_TRUNC use Manila wall-clock', () => {
      expect(PROVIDER_TOOLS).toMatch(
        /DATE_TRUNC\('week', now\(\) AT TIME ZONE 'Asia\/Manila'\) AT TIME ZONE 'Asia\/Manila'/,
      );
      expect(PROVIDER_TOOLS).toMatch(
        /DATE_TRUNC\('month', now\(\) AT TIME ZONE 'Asia\/Manila'\) AT TIME ZONE 'Asia\/Manila'/,
      );
    });
  });

  describe('admin.service.ts getDashboardKpis', () => {
    it('BUG-PHASE123-01 — pre-fix `created_at >= CURRENT_DATE` lines are gone from getDashboardKpis', () => {
      const fnBody = ADMIN.match(/export async function getDashboardKpis[\s\S]+?\n\}/);
      expect(fnBody).not.toBeNull();
      expect(fnBody?.[0]).not.toMatch(/created_at >= CURRENT_DATE/);
    });

    it('BUG-PHASE123-01 — today_revenue + new_signups_today + bookings_today all anchored to Manila midnight', () => {
      const fnBody = ADMIN.match(/export async function getDashboardKpis[\s\S]+?\n\}/)![0];
      // Three daily-anchored queries.
      const matches = fnBody.match(
        /\(now\(\) AT TIME ZONE 'Asia\/Manila'\)::date AT TIME ZONE 'Asia\/Manila'/g,
      );
      expect(matches?.length ?? 0).toBeGreaterThanOrEqual(3);
    });
  });

  describe('metrics.service.ts business KPIs', () => {
    it('BUG-PHASE123-01 — pre-fix `>= CURRENT_DATE` lines are gone from the metrics block', () => {
      // The fix block is the Promise.all of business KPI counts.
      const block = METRICS.match(/const \[active, completed, cancelled, disputes, providers, payments\][\s\S]+?\]\);/);
      expect(block).not.toBeNull();
      expect(block?.[0]).not.toMatch(/>= CURRENT_DATE/);
    });

    it('BUG-PHASE123-01 — completedToday + cancelledToday + paymentsToday all anchored to Manila midnight', () => {
      const block = METRICS.match(/const \[active, completed, cancelled, disputes, providers, payments\][\s\S]+?\]\);/)![0];
      const matches = block.match(
        /\(now\(\) AT TIME ZONE 'Asia\/Manila'\)::date AT TIME ZONE 'Asia\/Manila'/g,
      );
      expect(matches?.length ?? 0).toBeGreaterThanOrEqual(3);
    });
  });
});
