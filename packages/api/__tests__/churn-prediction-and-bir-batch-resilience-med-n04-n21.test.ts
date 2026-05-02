// MED-N04 + MED-N21 fix verified.
//
// MED-N04: getChurnPrediction loaded ALL customer rows into Node
// memory, computed risk score per row in JS, filtered by riskLevel,
// then sliced to a page. For 100k+ customers, every page request
// pulled all of them and dropped 99.98%. Now: scoring in SQL via
// CASE WHEN inside a CTE; ORDER BY + LIMIT/OFFSET in Postgres;
// total count from a paired COUNT(*) over the same CTE so
// pagination metadata stays accurate.
//
// MED-N21: quarterly BIR 2307 batch generation processed providers
// serially without per-provider error containment. A single
// provider's failure (DB hiccup, PDF render error, S3 upload
// throw) crashed the whole loop, leaving downstream providers
// unprocessed. Now: per-provider try/catch with batchesAttempted
// + batchesFailed + failures[] in the result so the operator
// gets a clear signal that the run was incomplete.

import { readFileSync } from 'fs';
import { resolve } from 'path';

const ANALYTICS = readFileSync(
  resolve(__dirname, '../src/services/admin-analytics.service.ts'),
  'utf8',
);
const BIR = readFileSync(
  resolve(__dirname, '../src/services/bir-2307.service.ts'),
  'utf8',
);

describe('MED-N04 — getChurnPrediction does scoring + pagination in SQL', () => {
  it('uses a CTE-based scoring query (WITH scored AS / leveled AS)', () => {
    expect(ANALYTICS).toMatch(/WITH scored AS \(/);
    expect(ANALYTICS).toMatch(/leveled AS \(/);
  });

  it('CASE WHEN computes risk_score in SQL', () => {
    expect(ANALYTICS).toMatch(/CASE WHEN[\s\S]{0,200}>= 90 THEN 40/);
    expect(ANALYTICS).toMatch(/COUNT\(b\.id\) <= 1 THEN 30/);
    expect(ANALYTICS).toMatch(/= 0 THEN 30/);
  });

  it('LEAST(100, ...) caps the score (mirrors the JS cap)', () => {
    expect(ANALYTICS).toMatch(/LEAST\(100,/);
  });

  it('risk_level is computed as a SQL column (not in JS)', () => {
    expect(ANALYTICS).toMatch(/CASE WHEN risk_score >= 80 THEN 'critical'/);
    expect(ANALYTICS).toMatch(/WHEN risk_score >= 60 THEN 'high'/);
    expect(ANALYTICS).toMatch(/WHEN risk_score >= 35 THEN 'medium'/);
  });

  it('riskLevel filter is whitelisted before SQL parameter binding', () => {
    expect(ANALYTICS).toMatch(/const allowedLevels = new Set\(\['low', 'medium', 'high', 'critical'\]\)/);
    expect(ANALYTICS).toMatch(/const safeLevel = riskLevel && allowedLevels\.has\(riskLevel\) \? riskLevel : null/);
  });

  it('SQL applies LIMIT + OFFSET (NOT JS slice)', () => {
    expect(ANALYTICS).toMatch(/LIMIT \$\{limitParam\} OFFSET \$\{offsetParam\}/);
  });

  it('total count comes from a paired COUNT(*) over the CTE', () => {
    expect(ANALYTICS).toMatch(/SELECT COUNT\(\*\)::text AS count FROM leveled/);
  });

  it('the OLD JS-side .slice(offset, offset + safePageSize) is REMOVED', () => {
    const block = ANALYTICS.match(/getChurnPrediction[\s\S]*?return \{ items, total[\s\S]{0,100}\};/);
    expect(block).not.toBeNull();
    expect(block![0]).not.toMatch(/\.slice\(offset, offset \+ safePageSize\)/);
  });

  it('the OLD JS-side filter on riskLevel is REMOVED', () => {
    const block = ANALYTICS.match(/getChurnPrediction[\s\S]*?return \{ items, total[\s\S]{0,100}\};/);
    expect(block).not.toBeNull();
    // No more `.filter((c) => c.riskLevel === riskLevel)` style call.
    expect(block![0]).not.toMatch(/\.filter\(\(c\) => c\.riskLevel === riskLevel\)/);
  });
});

describe('MED-N21 — BIR 2307 quarterly batch is per-provider error-resilient', () => {
  it('QuarterlyBatchResult includes batchesAttempted + batchesFailed + failures[]', () => {
    expect(BIR).toMatch(/batchesAttempted: number/);
    expect(BIR).toMatch(/batchesFailed: number/);
    expect(BIR).toMatch(/failures: Array<\{ providerId: string; error: string \}>/);
  });

  it('result is initialized with the new counters (zeroed)', () => {
    expect(BIR).toMatch(/batchesAttempted: 0,\s*batchesFailed: 0,\s*failures: \[\]/);
  });

  it('per-provider work is wrapped in try/catch', () => {
    expect(BIR).toMatch(/MED-N21 fix[\s\S]{0,500}try \{[\s\S]*?catch \(err\) \{/);
  });

  it('catch block logs error and pushes to failures, does NOT rethrow', () => {
    expect(BIR).toMatch(/result\.batchesFailed \+= 1/);
    expect(BIR).toMatch(/result\.failures\.push\(\{ providerId, error: errMsg \}\)/);
    expect(BIR).toMatch(/Continue to next provider — do NOT rethrow/);
  });

  it('completion log uses warn level when any provider failed', () => {
    expect(BIR).toMatch(/const incomplete = result\.batchesFailed > 0/);
    expect(BIR).toMatch(/logger\[incomplete \? 'warn' : 'info'\]/);
  });

  it('completion log includes the new attempted/failed/incomplete fields', () => {
    expect(BIR).toMatch(/batchesAttempted: result\.batchesAttempted/);
    expect(BIR).toMatch(/batchesFailed: result\.batchesFailed/);
    expect(BIR).toMatch(/incomplete,/);
  });

  it('batchesAttempted increments before the try (so it counts even when the try throws)', () => {
    // Source-level: the increment sits in the comment block above
    // the try, before the try keyword.
    expect(BIR).toMatch(/result\.batchesAttempted \+= 1;\s*try \{/);
  });
});
