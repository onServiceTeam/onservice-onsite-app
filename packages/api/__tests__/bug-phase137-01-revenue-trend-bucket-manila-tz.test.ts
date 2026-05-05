// BUG-PHASE137-01 — admin-analytics.service.ts:getRevenueTrend
// generated daily revenue/GMV trend points using bare
// DATE_TRUNC('day', NOW()) for the series boundaries AND
// DATE_TRUNC('day', created_at) for the per-day bucket label, both
// truncating at session TZ (UTC). The trend chart on the admin
// dashboard showed days labeled like "2026-05-01" but each bucket
// actually covered 08:00 Manila May 1 → 08:00 Manila May 2 (a
// 24-hour window shifted +8 hours from real Manila day).
//
// Continuation of the Phase 136 fix — Phase 136 fixed the
// rangeStartSql / previousRangeSql day boundaries (used in single-
// number KPI cards), but missed the trend-line bucket labeling. Same
// fix-class, different surface.
//
// Same Manila-anchored idiom as Phases 132-136. For per-row
// bucketing, use `DATE_TRUNC('day', col AT TIME ZONE 'Asia/Manila')`
// — the bucket key is then a Manila wall-clock day (timestamp
// without TZ), cast to ::date for join compatibility.

import { readFileSync } from 'fs';
import { resolve } from 'path';

const SVC = readFileSync(
  resolve(__dirname, '../src/services/admin-analytics.service.ts'),
  'utf8',
);

describe('BUG-PHASE137-01 — revenue-trend bucket labels Manila-anchored', () => {
  it('series boundary uses Manila day-start (start)', () => {
    expect(SVC).toMatch(
      /\(DATE_TRUNC\('day', NOW\(\) AT TIME ZONE 'Asia\/Manila'\) AT TIME ZONE 'Asia\/Manila'\) - \(\(\$1::int - 1\) \|\| ' days'\)::interval/,
    );
  });

  it('series boundary uses Manila day-start (end)', () => {
    expect(SVC).toMatch(
      /\(DATE_TRUNC\('day', NOW\(\) AT TIME ZONE 'Asia\/Manila'\) AT TIME ZONE 'Asia\/Manila'\),\s*INTERVAL '1 day'/,
    );
  });

  it('GMV bucketing uses Manila day on created_at', () => {
    expect(SVC).toMatch(
      /\(DATE_TRUNC\('day', created_at AT TIME ZONE 'Asia\/Manila'\)\)::date AS day,\s*COALESCE\(SUM\(amount\), 0\)::bigint AS amount\s*FROM wallet_transactions\s*WHERE type = 'payment'/,
    );
  });

  it('Revenue bucketing uses Manila day on created_at', () => {
    expect(SVC).toMatch(
      /\(DATE_TRUNC\('day', created_at AT TIME ZONE 'Asia\/Manila'\)\)::date AS day,\s*COALESCE\(SUM\(amount\), 0\)::bigint AS amount\s*FROM wallet_transactions\s*WHERE type IN \('commission', 'service_fee'\)/,
    );
  });

  it('regression guard: PHASE137 fix-comment is preserved (signposts the fix)', () => {
    expect(SVC).toMatch(/BUG-PHASE137-01 fix/);
  });
});
