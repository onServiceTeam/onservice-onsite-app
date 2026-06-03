// Phase K MED-K03 / K05 / K11 / K17 — fixes verified.

import { readFileSync } from 'fs';
import { resolve } from 'path';

const API = readFileSync(
  resolve(__dirname, '../src/services/api.ts'),
  'utf8',
);
const PROVIDER_API = readFileSync(
  resolve(__dirname, '../src/services/provider-api.service.ts'),
  'utf8',
);
const DASHBOARD = readFileSync(
  resolve(__dirname, '../app/(provider-tabs)/dashboard.tsx'),
  'utf8',
);
const STATUS_BADGE = readFileSync(
  resolve(__dirname, '../src/components/StatusBadge.tsx'),
  'utf8',
);

describe('Phase K MED-K03 — api.ts refresh is single-flight', () => {
  it('MED-K03 — inFlightRefresh module-level promise gates concurrent refreshes', () => {
    expect(API).toMatch(/let inFlightRefresh: Promise<string \| null> \| null = null/);
    expect(API).toMatch(/if \(inFlightRefresh\) return inFlightRefresh/);
  });
  it('MED-K03 — finally block clears the gate via setTimeout(..., 0)', () => {
    expect(API).toMatch(/setTimeout\(\(\) => \{ inFlightRefresh = null; \}, 0\)/);
  });
});

describe('Phase K MED-K05 — provider-api ProviderSelf.tier includes founding', () => {
  it('MED-K05 — tier union literal contains founding', () => {
    expect(PROVIDER_API).toMatch(/tier: 'founding' \| 'new' \| 'verified' \| 'pro' \| 'elite'/);
  });
});

// Phase 200 supersedes MED-K11: the provider dashboard now shows servicePrice
// (the provider's gross for the job), matching the Jobs tab. totalAmount
// includes the customer's platform fee the provider never receives, so showing
// it here overstated the provider's take AND disagreed with the Jobs tab card
// (same job, two different prices). The job-detail screen still shows the full
// net-of-commission breakdown.
describe('Phase 200 — provider dashboard job card shows servicePrice, consistent with the Jobs tab', () => {
  it('jobPrice text shows servicePrice', () => {
    expect(DASHBOARD).toMatch(/<Text style=\{styles\.jobPrice\}>\{formatPHP\(job\.servicePrice\)\}<\/Text>/);
  });
  it('no longer renders the customer total (totalAmount) on the provider card', () => {
    expect(DASHBOARD).not.toMatch(/<Text style=\{styles\.jobPrice\}>\{formatPHP\(job\.totalAmount\)\}<\/Text>/);
  });
});

describe('Phase K MED-K17 — StatusBadge maps full backend booking status set', () => {
  it('MED-K17 — type union includes requested/quoted/payment_pending/resolved/payout_ready/paid_out', () => {
    expect(STATUS_BADGE).toMatch(/'requested'/);
    expect(STATUS_BADGE).toMatch(/'quoted'/);
    expect(STATUS_BADGE).toMatch(/'payment_pending'/);
    expect(STATUS_BADGE).toMatch(/'resolved'/);
    expect(STATUS_BADGE).toMatch(/'payout_ready'/);
    expect(STATUS_BADGE).toMatch(/'paid_out'/);
  });
  it('MED-K17 — STATUS_MAP entries provide friendly labels', () => {
    expect(STATUS_BADGE).toMatch(/payout_ready: \{ bg: colors\.successLight, fg: colors\.successDark, label: 'Payout ready' \}/);
    expect(STATUS_BADGE).toMatch(/paid_out: \{ bg: colors\.divider, fg: colors\.textSecondary, label: 'Paid out' \}/);
    expect(STATUS_BADGE).toMatch(/quoted: \{ bg: colors\.infoLight, fg: colors\.info, label: 'Quote received' \}/);
  });
  it('MED-K17 — all three cancellation states still labeled "Cancelled" (Bug 901 invariant)', () => {
    const cancelMatches = STATUS_BADGE.match(/cancelled_by_\w+: \{ bg: colors\.divider, fg: colors\.textSecondary, label: 'Cancelled' \}/g);
    expect(cancelMatches).not.toBeNull();
    expect(cancelMatches!.length).toBe(3);
  });
});
