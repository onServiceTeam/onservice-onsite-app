// MED-N12 + MED-N34 fix verified.
//
// MED-N12: getEscrowSummary derived aging-bucket counts from a
// LIMIT 500 list. Any backlog above 500 (post-outage, post-payout-
// job-failure) silently undercounted — admin viewing the escrow
// tab during a backlog saw only the first 500. Now: separate
// aggregate query (no LIMIT) drives the bucket counts; the
// displayed list keeps its 500 cap to bound payload size; the
// pendingReleaseCount is the accurate total (was list length).
//
// MED-N34: getEarningsSummary returned pendingEscrow as gross
// SUM(service_price) while the earned* totals were net (post-
// commission via wallet_transactions). Mixed units misled
// providers into thinking they'd receive higher payouts than
// they actually would. Now: read provider's tier, compute pending
// net of commission via settingsService.getCommissionRate.

import { readFileSync } from 'fs';
import { resolve } from 'path';

const FIN_ADMIN = readFileSync(
  resolve(__dirname, '../src/services/financial-admin.service.ts'),
  'utf8',
);
const PROV_TOOLS = readFileSync(
  resolve(__dirname, '../src/services/provider-tools.service.ts'),
  'utf8',
);

describe('MED-N12 — getEscrowSummary aging buckets sourced from no-LIMIT aggregate', () => {
  it('runs THREE queries (wallet + aggregate + list), not two', () => {
    expect(FIN_ADMIN).toMatch(/const \[walletRes, aggRes, listRes\] = await Promise\.all\(\[/);
  });

  it('aggregate query has GROUP BY bucket and NO LIMIT', () => {
    const block = FIN_ADMIN.match(/db\.query<\{ bucket:[\s\S]*?GROUP BY bucket`,/);
    expect(block).not.toBeNull();
    expect(block![0]).not.toMatch(/LIMIT/);
  });

  it('aggregate query selects COUNT and SUM per bucket', () => {
    const block = FIN_ADMIN.match(/db\.query<\{ bucket:[\s\S]*?GROUP BY bucket`,/);
    expect(block).not.toBeNull();
    expect(block![0]).toMatch(/COUNT\(\*\)::text\s+AS count/);
    expect(block![0]).toMatch(/COALESCE\(SUM\(b\.total_amount\), 0\)::text\s+AS total/);
  });

  it('list query keeps its LIMIT 500 (display cap)', () => {
    expect(FIN_ADMIN).toMatch(/LIMIT \$\{PENDING_LIST_LIMIT\}/);
    expect(FIN_ADMIN).toMatch(/const PENDING_LIST_LIMIT = 500/);
  });

  it('pendingReleaseCount uses the aggregate total (not the truncated list length)', () => {
    expect(FIN_ADMIN).toMatch(/pendingReleaseCount: totalPendingCount/);
    expect(FIN_ADMIN).toMatch(/totalPendingCount \+= Number\(row\.count\)/);
  });

  it('agingBuckets sourced from bucketTotals populated by the aggregate query', () => {
    expect(FIN_ADMIN).toMatch(/bucketTotals\[row\.bucket\] = \{ count: Number\(row\.count\), total: Number\(row\.total\) \}/);
  });

  it('comment documents the MED-N12 rationale', () => {
    expect(FIN_ADMIN).toMatch(/MED-N12 fix.*?LIMIT 500/s);
  });
});

describe('MED-N34 — getEarningsSummary returns pendingEscrow NET of commission', () => {
  it('reads the provider tier first', () => {
    expect(PROV_TOOLS).toMatch(/MED-N34 fix[\s\S]{0,1000}SELECT tier FROM providers WHERE id = \$1/);
  });

  it('reads commission rate via settingsService.getCommissionRate', () => {
    expect(PROV_TOOLS).toMatch(/MED-N34 fix[\s\S]{0,1500}await settingsService\.getCommissionRate\(tierRow\.rows\[0\]\.tier\)/);
  });

  it('falls back to 0.15 commission default if settings unreachable', () => {
    expect(PROV_TOOLS).toMatch(/let commissionRate = 0\.15/);
    expect(PROV_TOOLS).toMatch(/Commission rate lookup failed in earnings summary; using 0\.15 default/);
  });

  it('escrow pending query returns gross, then net is computed JS-side', () => {
    expect(PROV_TOOLS).toMatch(/AS pending_gross/);
    expect(PROV_TOOLS).toMatch(/const pendingNet = Math\.round\(pendingGross \* \(1 - commissionRate\)\)/);
  });

  it('pendingEscrow in the response is the NET value', () => {
    expect(PROV_TOOLS).toMatch(/pendingEscrow: pendingNet, \/\/ MED-N34: now net of commission/);
  });

  it('hardcoded gross-pendingEscrow path is REMOVED', () => {
    // The pre-fix line was:
    //   pendingEscrow: Number(escrowResult.rows[0]?.pending ?? 0),
    expect(PROV_TOOLS).not.toMatch(/pendingEscrow: Number\(escrowResult\.rows\[0\]\?\.pending \?\? 0\)/);
  });
});
