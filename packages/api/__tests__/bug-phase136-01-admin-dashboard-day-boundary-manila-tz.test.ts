// BUG-PHASE136-01 — admin-analytics.service.ts had THREE DATE_TRUNC
// sites that truncated NOW() at the session TZ (UTC), giving UTC
// midnight = 08:00 Manila as the day boundary. Same fix-shape as
// Phases 132/133/134/135 — but at the day-bucket level, not just
// filter literals.
//
// Sites:
//   1. rangeStartSql('today') / 'ytd' (line 944/945)
//      — drives all dashboard "today" / "year-to-date" KPIs
//   2. previousRangeSql('today') / 'ytd' (line 955/963)
//      — drives the "vs previous period" comparison cards
//   3. getDashboardKpis "today_bookings" subquery (line 1013)
//      — count of bookings created today
//   4. getServiceAreaOverview "today_bookings" per area (line 1412)
//      — count of bookings per service-area today
//
// Pre-fix all four returned UTC-midnight as the day boundary, so
// during the 8-hour window each Manila day between 00:00 Manila and
// 08:00 Manila, "today" actually meant "yesterday Manila" — the
// dashboard counters silently restarted from yesterday's data instead
// of starting fresh at Manila midnight. For an admin opening the
// dashboard at 06:00 AM, "today's revenue" included yesterday's
// 16:00-23:59 Manila revenue and excluded last night's 00:00-06:00
// Manila revenue.
//
// The "ytd" boundary has the same bug at New Year (8 hours each Jan 1).
//
// Same Manila-anchor idiom as the rest of the audit pass. Wrap NOW()
// in `AT TIME ZONE 'Asia/Manila'` to get Manila wall-clock time, then
// DATE_TRUNC to the appropriate boundary, then re-anchor with
// `AT TIME ZONE 'Asia/Manila'` to get back to a timestamptz.

import { readFileSync } from 'fs';
import { resolve } from 'path';

const SVC = readFileSync(
  resolve(__dirname, '../src/services/admin-analytics.service.ts'),
  'utf8',
);

describe('BUG-PHASE136-01 — admin dashboard day/year boundaries Manila-anchored', () => {
  it('rangeStartSql("today") returns Manila day-start expression', () => {
    expect(SVC).toMatch(
      /MANILA_DAY_START_SQL\s*=\s*"DATE_TRUNC\('day', NOW\(\) AT TIME ZONE 'Asia\/Manila'\) AT TIME ZONE 'Asia\/Manila'"/,
    );
  });

  it('rangeStartSql("ytd") returns Manila year-start expression', () => {
    expect(SVC).toMatch(
      /MANILA_YEAR_START_SQL\s*=\s*"DATE_TRUNC\('year', NOW\(\) AT TIME ZONE 'Asia\/Manila'\) AT TIME ZONE 'Asia\/Manila'"/,
    );
  });

  it('previousRangeSql("today") uses Manila day-start - 1 day for the prior bucket', () => {
    // The prior-day boundary is "Manila-today minus 1 day" so the
    // delta against today aligns on Manila boundaries.
    expect(SVC).toMatch(/\$\{MANILA_DAY_START_SQL\} - INTERVAL '1 day'/);
  });

  it('previousRangeSql("ytd") uses Manila year-start of last year', () => {
    expect(SVC).toMatch(
      /DATE_TRUNC\('year', \(NOW\(\) - INTERVAL '1 year'\) AT TIME ZONE 'Asia\/Manila'\) AT TIME ZONE 'Asia\/Manila'/,
    );
  });

  it('getDashboardKpis "today_bookings" subquery uses Manila day-start', () => {
    expect(SVC).toMatch(
      /FROM bookings WHERE created_at >= DATE_TRUNC\('day', NOW\(\) AT TIME ZONE 'Asia\/Manila'\) AT TIME ZONE 'Asia\/Manila'/,
    );
  });

  it('service-area today_bookings subquery uses Manila day-start', () => {
    expect(SVC).toMatch(
      /b\.created_at >= DATE_TRUNC\('day', NOW\(\) AT TIME ZONE 'Asia\/Manila'\) AT TIME ZONE 'Asia\/Manila'/,
    );
  });

  it('regression guard: bare DATE_TRUNC("day", NOW()) (no Manila anchor) is gone for filter sites', () => {
    // The fix targets DAY-level boundaries used in WHERE filters.
    // The trend-bucketing sites at L1075/1083 use DATE_TRUNC on
    // the column value (not NOW()) and are out of scope for this
    // phase. Specifically check that no `DATE_TRUNC('day', NOW())`
    // remains as a comparison RHS.
    expect(SVC).not.toMatch(/created_at >= DATE_TRUNC\('day', NOW\(\)\)(?! AT TIME ZONE)/);
    expect(SVC).not.toMatch(/=\s+DATE_TRUNC\('day', NOW\(\)\)(?! AT TIME ZONE)(?!.*MANILA_DAY_START)/);
  });
});
