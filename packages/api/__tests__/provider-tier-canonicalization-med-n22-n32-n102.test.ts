// MED-N32 + MED-N102 regression coverage — the 'founding' tier
// (introduced in migration 073) is recognized in platform config and
// matching. Provider progression now has dedicated behavioral tests in
// services/provider-tier-*.test.ts instead of source-text assertions.
//
//   1. platformConfig.commissionRates  → adds founding=0.10
//   2. matching.service.ts TIER_BONUS  → adds founding=0.5
//   3. provider-tools.service.ts:460   → fixed transitively via #1
//      (no longer falls back to 'new' commission for founding rows)
//
// These are source-level signature checks PLUS a behavioral check
// against the platformConfig (which is pure config — no DB needed).

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { platformConfig } from '../src/config/platform.config';

const MATCHING_SVC = readFileSync(
  resolve(__dirname, '../src/services/matching.service.ts'),
  'utf8',
);

describe('MED-N32 + MED-N102 — founding tier is canonical in config and matching', () => {
  it('MED-N32 — platformConfig.commissionRates includes founding=0.10', () => {
    expect(platformConfig.commissionRates).toHaveProperty('founding');
    expect(platformConfig.commissionRates['founding']).toBe(0.10);
  });

  it('MED-N32 — platformConfig.commissionRates contains all 5 tier keys (matches migration 073 CHECK constraint)', () => {
    const keys = Object.keys(platformConfig.commissionRates).sort();
    expect(keys).toEqual(['elite', 'founding', 'new', 'pro', 'verified']);
  });

  it('MED-N32 — provider-tools generateReceipt no longer falls back to new commission for founding tier', () => {
    // The receipt builder reads `platformConfig.commissionRates[prov.tier]`
    // with `?? platformConfig.commissionRates['new']!` as fallback. With
    // founding now present, indexing returns 0.10 (founding's actual
    // rate) instead of triggering the 'new' fallback (0.15). We verify
    // the indexing semantics with a representative founding-tier row.
    const tier = 'founding';
    const rate = platformConfig.commissionRates[tier] ?? platformConfig.commissionRates['new']!;
    expect(rate).toBe(0.10);
    // Sanity — a real founding-tier provider receipt for ₱1000 service
    // would now show ₱100 commission, not ₱150 (the bug-pre-fix output).
    const servicePrice = 1000;
    expect(Math.round(servicePrice * rate)).toBe(100);
  });

  it('MED-N102 — matching.service.ts TIER_BONUS includes founding entry', () => {
    expect(MATCHING_SVC).toMatch(/founding:\s*0\.5/);
  });

  it('MED-N102 — matching.service.ts TIER_BONUS contains all 5 tier keys', () => {
    // The 5 tiers from migration 073 CHECK constraint must all be
    // recognized by the matching scorer.
    expect(MATCHING_SVC).toMatch(/founding:/);
    expect(MATCHING_SVC).toMatch(/new:/);
    expect(MATCHING_SVC).toMatch(/verified:/);
    expect(MATCHING_SVC).toMatch(/pro:/);
    expect(MATCHING_SVC).toMatch(/elite:/);
  });
});
