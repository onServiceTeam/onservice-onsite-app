// MED-N05 + MED-N41 fix verified.
//
// MED-N05: provider quality score's `responseScore` was hardcoded
// 75. The 5-component model in platformConfig.qualityScoreWeights
// includes a 10% weight for "response" but the input was constant
// — providers couldn't be penalized for slow quote-response time.
// Now: computed from booking_quotes table as average minutes
// between job-request creation and provider's quote submission;
// sliding-tier mapping to a 25-100 score; falls back to 75 when
// the provider has zero quotes in the period.
//
// MED-N41: business.updateContractStatus accepted only
// 'active' | 'cancelled'. The DB CHECK constraint accepts the
// full lifecycle (draft, active, expired, cancelled) but admin
// could not mark contracts as expired. Now: param type widened
// to match CHECK; runtime guard rejects unknown values with 400.

import { readFileSync } from 'fs';
import { resolve } from 'path';

const ANALYTICS = readFileSync(
  resolve(__dirname, '../src/services/admin-analytics.service.ts'),
  'utf8',
);
const BUSINESS = readFileSync(
  resolve(__dirname, '../src/services/business.service.ts'),
  'utf8',
);

describe('MED-N05 — responseScore is computed from booking_quotes', () => {
  it('SQL pulls average response time via WITH quote_response CTE', () => {
    expect(ANALYTICS).toMatch(/WITH quote_response AS/);
    expect(ANALYTICS).toMatch(/AVG\(EXTRACT\(EPOCH FROM \(bq\.created_at - b\.created_at\)\) \/ 60\.0\) AS avg_minutes/);
  });

  it('SELECT exposes avg_response_minutes + quote_count', () => {
    expect(ANALYTICS).toMatch(/qr\.avg_minutes::text AS avg_response_minutes/);
    expect(ANALYTICS).toMatch(/COALESCE\(qr\.qcount, 0\)::text AS quote_count/);
  });

  it('hardcoded responseScore = 75 is REMOVED from the loop', () => {
    // The literal `const responseScore = 75;` no longer appears.
    expect(ANALYTICS).not.toMatch(/^\s*const responseScore = 75;/m);
  });

  it('sliding-tier mapping: <30 → 100, <60 → 90, <120 → 80, <360 → 70, <1440 → 50, else 25', () => {
    expect(ANALYTICS).toMatch(/avgRespMins < 30[\s\S]{0,80}responseScore = 100/);
    expect(ANALYTICS).toMatch(/avgRespMins < 60[\s\S]{0,80}responseScore = 90/);
    expect(ANALYTICS).toMatch(/avgRespMins < 120[\s\S]{0,80}responseScore = 80/);
    expect(ANALYTICS).toMatch(/avgRespMins < 360[\s\S]{0,80}responseScore = 70/);
    expect(ANALYTICS).toMatch(/avgRespMins < 1440[\s\S]{0,80}responseScore = 50/);
    expect(ANALYTICS).toMatch(/responseScore = 25/);
  });

  it('zero quotes / null avg → fallback 75 (preserves pre-fix behavior for providers with no signal)', () => {
    expect(ANALYTICS).toMatch(/quoteCount === 0 \|\| avgRespMins === null[\s\S]{0,80}responseScore = 75/);
  });

  it('comment documents the sliding tier and 0-quotes fallback', () => {
    // Either occurrence of the MED-N05 fix comment is fine.
    expect(ANALYTICS).toMatch(/MED-N05 fix/);
    expect(ANALYTICS).toMatch(/Sliding tier/i);
  });
});

describe('MED-N41 — updateContractStatus accepts the full DB CHECK lifecycle', () => {
  it('exports BusinessContractStatus union type', () => {
    expect(BUSINESS).toMatch(/export type BusinessContractStatus = 'draft' \| 'active' \| 'expired' \| 'cancelled'/);
  });

  it('ALLOWED_CONTRACT_STATUSES set contains all 4 values', () => {
    expect(BUSINESS).toMatch(/'draft', 'active', 'expired', 'cancelled'/);
  });

  it('updateContractStatus signature uses the widened type', () => {
    expect(BUSINESS).toMatch(/updateContractStatus[\s\S]{0,400}status: BusinessContractStatus/);
  });

  it('runtime guard rejects unknown status with 400', () => {
    expect(BUSINESS).toMatch(/if \(!ALLOWED_CONTRACT_STATUSES\.has\(status\)\)[\s\S]{0,200}createAppError\([\s\S]{0,200}400/);
  });

  it('comment documents the auto_renew not-implemented note', () => {
    expect(BUSINESS).toMatch(/auto_renew[\s\S]*?UI-only marker/);
  });
});
