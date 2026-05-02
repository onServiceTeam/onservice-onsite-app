// MED-N06 + MED-N07 fix verified.
//
// MED-N06: getCommissionOptimizationSuggestions used
// `platformConfig.commissionRates[tier]` as the basis for its
// "currentRate" comparison. If admin had tuned a rate via
// /admin/settings, the suggestion compared to the wrong starting
// point. Now: read via settingsService.getCommissionRate(tier),
// which routes through platform_settings with platformConfig
// fallback.
//
// MED-N07: pre-fix `Object.keys(platformConfig.commissionRates)`
// returned 4 keys (no 'founding') because platformConfig had only
// 4 tiers. Founding-tier providers got no suggestion. D-J17 already
// added 'founding' to platformConfig.commissionRates, so this
// keys-list query now returns all 5 tiers — fix is transitive.

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { platformConfig } from '../src/config/platform.config';

const SVC = readFileSync(
  resolve(__dirname, '../src/services/admin-analytics.service.ts'),
  'utf8',
);

describe('MED-N06 — currentRate sourced from settingsService.getCommissionRate', () => {
  it('admin-analytics imports settingsService', () => {
    expect(SVC).toMatch(/import \* as settingsService from '\.\/settings\.service'/);
  });

  it('the getCommissionOptimizationSuggestions loop reads commission via settingsService', () => {
    const block = SVC.match(/getCommissionOptimizationSuggestions[\s\S]*?return suggestions;/);
    expect(block).not.toBeNull();
    expect(block![0]).toMatch(/await settingsService\.getCommissionRate\(tier\)/);
  });

  it('falls back to platformConfig.commissionRates on settings failure', () => {
    expect(SVC).toMatch(/Commission rate lookup failed; using platformConfig fallback/);
    expect(SVC).toMatch(/currentRate = platformConfig\.commissionRates\[tier\]!/);
  });

  it('the OLD direct platformConfig read is NO LONGER the primary path', () => {
    // The primary path now goes through settingsService.getCommissionRate,
    // and the platformConfig read sits inside the catch block.
    const block = SVC.match(/getCommissionOptimizationSuggestions[\s\S]*?return suggestions;/);
    // The first occurrence of `platformConfig.commissionRates[tier]` in
    // the loop must be inside a `try/catch ... currentRate =` fallback.
    expect(block![0]).toMatch(/try \{\s*currentRate = await settingsService/);
  });
});

describe('MED-N07 — founding tier is recognized in the suggestion loop (transitive via D-J17)', () => {
  it('platformConfig.commissionRates contains founding (D-J17 fix)', () => {
    expect(platformConfig.commissionRates).toHaveProperty('founding');
  });

  it('Object.keys(platformConfig.commissionRates) returns all 5 tiers', () => {
    const keys = Object.keys(platformConfig.commissionRates).sort();
    expect(keys).toEqual(['elite', 'founding', 'new', 'pro', 'verified']);
  });

  it('the suggestion loop iterates over those keys (so founding now gets analyzed)', () => {
    expect(SVC).toMatch(/const tiers = Object\.keys\(platformConfig\.commissionRates\)/);
    expect(SVC).toMatch(/for \(const tier of tiers\)/);
  });
});
