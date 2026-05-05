// BUG-PHASE134-01 — provider-tools.service.ts:getMonthlyEarnings had
// THREE Pg date-comparison sites that cast YYYY-MM-DD month bounds
// to ::date without `AT TIME ZONE 'Asia/Manila'`. The session TZ is
// UTC, so `'2026-05-01'::date` was interpreted as UTC midnight =
// 08:00 Manila of May 1.
//
// For a provider's "May 2026" monthly earnings the window shifted by
// +8 hours: any job confirmed at 02:00 Manila on May 1 was excluded
// from May, and any job confirmed at 02:00 Manila on Jun 1 was
// wrongly INCLUDED in May. Same +8h shift for tips and payouts.
// Money-path-adjacency: a provider's monthly statement was
// systematically mis-windowed at month boundaries.
//
// Same bug-class and fix-shape as Phases 132 (marketing) and 133
// (audit-log). Half-open Manila-anchored interval includes the entire
// to-day Manila and excludes the new-month-day Manila.
//
// Test strategy: source-content regression on all 3 query sites.
// Behavioral correctness (provider sees the right total at the
// boundary instant) requires a real Pg fixture not in scope; the SQL
// idiom is the canonical proof of bound semantics.

import { readFileSync } from 'fs';
import { resolve } from 'path';

const SVC = readFileSync(
  resolve(__dirname, '../src/services/provider-tools.service.ts'),
  'utf8',
);

describe('BUG-PHASE134-01 — provider monthly earnings Manila-anchored', () => {
  it('jobs query uses Manila-anchored half-open interval', () => {
    expect(SVC).toMatch(
      /COALESCE\(b\.confirmed_at, b\.completed_at\) >= \(\$2::date AT TIME ZONE 'Asia\/Manila'\)/,
    );
    expect(SVC).toMatch(
      /COALESCE\(b\.confirmed_at, b\.completed_at\) < \(\(\$3::date \+ INTERVAL '1 day'\) AT TIME ZONE 'Asia\/Manila'\)/,
    );
  });

  it('tips query uses Manila-anchored half-open interval', () => {
    // The tips query INNER JOINs bookings and filters by t.created_at.
    expect(SVC).toMatch(/t\.created_at >= \(\$2::date AT TIME ZONE 'Asia\/Manila'\)/);
    expect(SVC).toMatch(
      /t\.created_at < \(\(\$3::date \+ INTERVAL '1 day'\) AT TIME ZONE 'Asia\/Manila'\)/,
    );
  });

  it('payouts query uses Manila-anchored half-open interval', () => {
    expect(SVC).toMatch(/completed_at >= \(\$2::date AT TIME ZONE 'Asia\/Manila'\)/);
    expect(SVC).toMatch(
      /completed_at < \(\(\$3::date \+ INTERVAL '1 day'\) AT TIME ZONE 'Asia\/Manila'\)/,
    );
  });

  it('regression guard: bare `::date` comparisons (no Manila anchor) are gone', () => {
    // Pre-fix shape: `>= $2::date` and `< ($3::date + INTERVAL '1 day')`.
    // The `(>=|<) \$N::date` without an immediately following
    // `AT TIME ZONE 'Asia/Manila'` is the broken shape. Make sure
    // the file no longer has any bare `>= $2::date` for the
    // earnings query.
    expect(SVC).not.toMatch(/COALESCE\(b\.confirmed_at, b\.completed_at\) >= \$2::date\b/);
    expect(SVC).not.toMatch(/t\.created_at >= \$2::date\b/);
    expect(SVC).not.toMatch(/completed_at >= \$2::date\b/);
  });
});
