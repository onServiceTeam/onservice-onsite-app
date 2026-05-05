// BUG-PHASE139-01 — financial-admin.service.ts had EIGHT date-bound
// query sites (across 6 functions: getOverview, getRevenueByCategory,
// getCommissionTrend, getRefundsTrend, getPayoutsBreakdown,
// getTopProviders, getPayoutsTab today-cell, getOrSearch issued_at)
// that all cast YYYY-MM-DD `from`/`to` strings as `$N::date` without
// `AT TIME ZONE 'Asia/Manila'`. Session TZ is UTC, so each bound
// landed at UTC midnight = 08:00 Manila of the input date.
//
// Net effect: every financial dashboard tab (Revenue, Commissions,
// Refunds, Payouts, Top Providers) misreported by the same +8 hour
// shift on every from/to query. A finance admin running
// "from='2026-05-01' to='2026-05-31'" missed the 00:00-08:00 Manila
// window of May 1 AND excluded 08:00-23:59 Manila of May 31 — a
// 16-hour blind spot at the to-side every query, just like Phase 132
// for marketing.
//
// Plus the today_completed_count/total cells used `completed_at::date
// = NOW()::date` — both casts at session TZ (UTC), so "today
// completed" was the wrong day for 8 hours every Manila day.
//
// Same Manila-anchored idiom as Phases 132/133/134/135/136/137/138.

import { readFileSync } from 'fs';
import { resolve } from 'path';

const SVC = readFileSync(
  resolve(__dirname, '../src/services/financial-admin.service.ts'),
  'utf8',
);

describe('BUG-PHASE139-01 — financial-admin date filters Manila-anchored', () => {
  it('all >= ($1::date) bounds are Manila-anchored', () => {
    // Count occurrences. Pre-fix: 6+ sites with bare `>= ($1::date)`.
    // Post-fix: same number wrapped with `AT TIME ZONE 'Asia/Manila'`.
    const goodMatches = SVC.match(/>= \(\(\$1::date\) AT TIME ZONE 'Asia\/Manila'\)/g);
    expect(goodMatches).not.toBeNull();
    expect(goodMatches!.length).toBeGreaterThanOrEqual(6);
  });

  it('all <  ($2::date + INTERVAL "1 day") bounds are Manila-anchored', () => {
    const goodMatches = SVC.match(
      /<\s+\(\(\$2::date \+ INTERVAL '1 day'\) AT TIME ZONE 'Asia\/Manila'\)/g,
    );
    expect(goodMatches).not.toBeNull();
    expect(goodMatches!.length).toBeGreaterThanOrEqual(6);
  });

  it('today_completed cells use Manila-anchored date comparison', () => {
    expect(SVC).toMatch(
      /\(completed_at AT TIME ZONE 'Asia\/Manila'\)::date = \(NOW\(\) AT TIME ZONE 'Asia\/Manila'\)::date/,
    );
  });

  it('OR search issued_at uses Manila-anchored half-open interval', () => {
    expect(SVC).toMatch(
      /o\.issued_at >= \(\(\$\$\{idx\}::date\) AT TIME ZONE 'Asia\/Manila'\) AND o\.issued_at < \(\(\$\$\{idx \+ 1\}::date \+ INTERVAL '1 day'\) AT TIME ZONE 'Asia\/Manila'\)/,
    );
  });

  it('regression guard: bare `>= ($1::date)` shape (no Manila anchor) is gone', () => {
    expect(SVC).not.toMatch(/>= \(\$1::date\)\s*$/m);
    expect(SVC).not.toMatch(/<\s+\(\$2::date \+ INTERVAL '1 day'\)\s*$/m);
  });

  it('regression guard: PHASE139 fix-comment is preserved', () => {
    expect(SVC).toMatch(/BUG-PHASE139-01 fix/);
  });
});
