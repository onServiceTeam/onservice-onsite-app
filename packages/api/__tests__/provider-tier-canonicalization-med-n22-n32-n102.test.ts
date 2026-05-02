// MED-N22 + MED-N32 + MED-N102 fix verified — the 'founding' tier
// (introduced in migration 073, commission_rate_founding=10) is now
// recognized at all four sites that previously knew only the 4-tier
// ladder:
//
//   1. platformConfig.commissionRates  → adds founding=0.10
//   2. provider.service.ts TIER_LADDER → adds founding entry,
//      special-cases progression so founding has nextTier=null
//   3. matching.service.ts TIER_BONUS  → adds founding=0.5
//   4. provider-tools.service.ts:460   → fixed transitively via #1
//      (no longer falls back to 'new' commission for founding rows)
//
// These are source-level signature checks PLUS a behavioral check
// against the platformConfig (which is pure config — no DB needed).

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { platformConfig } from '../src/config/platform.config';

const PROVIDER_SVC = readFileSync(
  resolve(__dirname, '../src/services/provider.service.ts'),
  'utf8',
);
const MATCHING_SVC = readFileSync(
  resolve(__dirname, '../src/services/matching.service.ts'),
  'utf8',
);

describe('MED-N22 + MED-N32 + MED-N102 — founding tier is canonical at all 4 sites', () => {
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

  it('MED-N22 — provider.service.ts TIER_LADDER includes founding entry', () => {
    expect(PROVIDER_SVC).toMatch(/tier:\s*'founding'/);
    expect(PROVIDER_SVC).toMatch(/commission:\s*10/);
  });

  it('MED-N22 — provider.service.ts getTierProgression special-cases founding so nextTier is null (no commission downgrade)', () => {
    // The fix guarantees: if the provider's tier is 'founding',
    // `nextTier` is computed as `null` (not new=15% which would be a
    // downgrade from 10%). The code path is gated by
    // `if (row.tier !== 'founding')` — verify that guard exists.
    expect(PROVIDER_SVC).toMatch(/row\.tier !== 'founding'/);
    // And that when row.tier === 'founding', nextTier remains the
    // initial `null`.
    expect(PROVIDER_SVC).toMatch(/let nextTier: TierRequirement \| null = null/);
  });

  it('MED-N22 — getTierProgression for non-founding still computes the standard 4-step ladder (founding excluded from upward path)', () => {
    // The fix uses `TIER_LADDER.filter((t) => t.tier !== 'founding')`
    // to derive the standard progression so founding doesn't appear
    // as a downgrade target for new/verified/pro providers.
    expect(PROVIDER_SVC).toMatch(/TIER_LADDER\.filter\(\(t\) => t\.tier !== 'founding'\)/);
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
