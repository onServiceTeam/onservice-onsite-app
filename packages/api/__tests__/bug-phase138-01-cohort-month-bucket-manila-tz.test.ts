// BUG-PHASE138-01 — admin-analytics.service.ts cohort analysis
// (retention + revenue) used DATE_TRUNC('month', ...) at session
// TZ (UTC). A customer signing up at 03:00 Manila on May 1
// (= 19:00 UTC Apr 30) was assigned to the April cohort instead of
// May. Same per-row bucketing mis-attribution as Phase 137 (daily
// trend), but at the month-boundary level for cohorts.
//
// Two queries with three DATE_TRUNC sites each (cohort_users insert
// + period_offset extract + month-comparison filter) — six sites
// total, all sharing one fix.
//
// Same Manila-anchored idiom: DATE_TRUNC('month', col AT TIME ZONE
// 'Asia/Manila') gives a Manila wall-clock month-start (timestamp
// without TZ), which ::date casts to a calendar date for join
// compatibility.

import { readFileSync } from 'fs';
import { resolve } from 'path';

const SVC = readFileSync(
  resolve(__dirname, '../src/services/admin-analytics.service.ts'),
  'utf8',
);

describe('BUG-PHASE138-01 — cohort analysis month buckets Manila-anchored', () => {
  it('cohort_users CTE uses Manila-anchored DATE_TRUNC for cohort_month', () => {
    // Both retention and revenue queries have a cohort_users CTE
    // with this exact shape — at least 2 occurrences.
    const matches = SVC.match(
      /\(DATE_TRUNC\('month', created_at AT TIME ZONE 'Asia\/Manila'\)\)::date AS cohort_month/g,
    );
    expect(matches).not.toBeNull();
    expect(matches!.length).toBeGreaterThanOrEqual(2);
  });

  it('retention activity period_offset uses Manila-anchored DATE_TRUNC', () => {
    expect(SVC).toMatch(
      /EXTRACT\(MONTH FROM AGE\(\(DATE_TRUNC\('month', b\.created_at AT TIME ZONE 'Asia\/Manila'\)\)::date, cu\.cohort_month\)\)::int AS period_offset[\s\S]+?status NOT IN/,
    );
  });

  it('retention activity month-comparison uses Manila-anchored DATE_TRUNC', () => {
    expect(SVC).toMatch(
      /\(DATE_TRUNC\('month', b\.created_at AT TIME ZONE 'Asia\/Manila'\)\)::date >= cu\.cohort_month[\s\S]+?status NOT IN/,
    );
  });

  it('revenue cohort_users uses Manila-anchored DATE_TRUNC', () => {
    // Second query (revenue metric, default branch). The same
    // retention query above also matches this regex via [\s\S], so
    // assert the revenue-specific WHERE clause appears too.
    expect(SVC).toMatch(
      /\(DATE_TRUNC\('month', b\.created_at AT TIME ZONE 'Asia\/Manila'\)\)::date >= cu\.cohort_month[\s\S]+?status IN \('confirmed'/,
    );
  });

  it('PHASE138 fix-comment is preserved in both cohort queries', () => {
    const matches = SVC.match(/BUG-PHASE138-01 fix/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBeGreaterThanOrEqual(2);
  });
});
