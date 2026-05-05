// BUG-PHASE140-01 — admin-analytics.service.ts:computeProviderQualityScores
// had two `bq.created_at >= $1::date` / `b.created_at >= $1::date`
// filters that cast at session TZ (UTC). The 90-day rolling window
// for provider quality scoring was off by ~+8 hours at the boundary
// (a quote made at 03:00 Manila on the 90th-day-prior was excluded
// from the window even though it should be included).
//
// Lower severity than 132-139 (analytics, not money path; rolling
// window so off-by-hours not days). Included for consistency with
// the rest of the audit pass.
//
// Same Manila-anchored idiom as Phases 132-139.

import { readFileSync } from 'fs';
import { resolve } from 'path';

const SVC = readFileSync(
  resolve(__dirname, '../src/services/admin-analytics.service.ts'),
  'utf8',
);

describe('BUG-PHASE140-01 — provider quality scoring date filter Manila-anchored', () => {
  it('quote_response CTE filter is Manila-anchored', () => {
    expect(SVC).toMatch(
      /bq\.created_at >= \(\$1::date AT TIME ZONE 'Asia\/Manila'\)/,
    );
  });

  it('LEFT JOIN bookings filter is Manila-anchored', () => {
    expect(SVC).toMatch(
      /AND b\.created_at >= \(\$1::date AT TIME ZONE 'Asia\/Manila'\)\s+LEFT JOIN quote_response/,
    );
  });

  it('regression guard: bare `created_at >= $1::date` (no Manila anchor) is gone in this function', () => {
    // The fix-comments in admin-analytics may mention the bare
    // shape as documentation — restrict the negative match to the
    // computeProviderQualityScores function block.
    const fnBlock = SVC.match(/computeProviderQualityScores[\s\S]+?GROUP BY p\.id/);
    if (fnBlock) {
      expect(fnBlock[0]).not.toMatch(/bq\.created_at >= \$1::date(?! AT TIME ZONE)/);
      expect(fnBlock[0]).not.toMatch(/b\.created_at >= \$1::date(?! AT TIME ZONE)/);
    }
  });
});
