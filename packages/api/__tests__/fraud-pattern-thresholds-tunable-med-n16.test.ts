// MED-N16 fix verified — fraud-pattern detection thresholds are
// now read from platform_settings instead of being hardcoded.
//
// Pre-fix: customer-admin.service.getCustomerDisputes had magic
// numbers (5 disputes / 30 days / 80% favor-provider rate). Ops
// couldn't tune as real-world dispute patterns revealed themselves.
//
// Post-fix: 3 new SETTING_DEFAULTS keys
// (fraud_pattern_dispute_count_threshold, fraud_pattern_window_days,
// fraud_pattern_favor_provider_rate) read at flag-evaluation time
// with built-in defaults that match the prior constants.

import { readFileSync } from 'fs';
import { resolve } from 'path';
import * as settingsService from '../src/services/settings.service';

const SVC = readFileSync(
  resolve(__dirname, '../src/services/customer-admin.service.ts'),
  'utf8',
);

describe('MED-N16 — settings.service SETTING_DEFAULTS contains the 3 fraud-pattern keys', () => {
  it('fraud_pattern_dispute_count_threshold default = 5 (matches pre-fix const)', () => {
    expect(settingsService.SETTING_DEFAULTS['fraud_pattern_dispute_count_threshold']).toBe('5');
  });

  it('fraud_pattern_window_days default = 30 (matches pre-fix const)', () => {
    expect(settingsService.SETTING_DEFAULTS['fraud_pattern_window_days']).toBe('30');
  });

  it('fraud_pattern_favor_provider_rate default = 0.80 (matches pre-fix const)', () => {
    expect(settingsService.SETTING_DEFAULTS['fraud_pattern_favor_provider_rate']).toBe('0.80');
  });
});

describe('MED-N16 — customer-admin.service.getCustomerDisputes reads the 3 settings', () => {
  it('imports settingsService', () => {
    expect(SVC).toMatch(/import \* as settingsService from '\.\/settings\.service'/);
  });

  it('reads fraud_pattern_dispute_count_threshold via getSettingInteger', () => {
    expect(SVC).toMatch(/settingsService\.getSettingInteger\('fraud_pattern_dispute_count_threshold'\)/);
  });

  it('reads fraud_pattern_window_days via getSettingInteger', () => {
    expect(SVC).toMatch(/settingsService\.getSettingInteger\('fraud_pattern_window_days'\)/);
  });

  it('reads fraud_pattern_favor_provider_rate via getSetting + Number', () => {
    expect(SVC).toMatch(/Number\(await settingsService\.getSetting\('fraud_pattern_favor_provider_rate'\)\)/);
  });

  it('uses the dynamic windowDays in the cutoff math (not hardcoded 30)', () => {
    expect(SVC).toMatch(/now - windowDays \* 24 \* 60 \* 60 \* 1000/);
  });

  it('uses the dynamic countThreshold + favorRateThreshold in the flagged check', () => {
    expect(SVC).toMatch(/recent\.length >= countThreshold/);
    expect(SVC).toMatch(/favorProviderRate >= favorRateThreshold/);
  });

  it('reason string uses the dynamic windowDays (not hardcoded 30)', () => {
    expect(SVC).toMatch(/in \$\{windowDays\} days/);
  });

  it('falls back to built-in defaults when settings unreadable (no exception escapes)', () => {
    // Source-level: the 3 settings reads sit inside a single try/catch,
    // and the catch logs a warn + falls through with the in-scope let
    // bindings still holding their initialized defaults.
    expect(SVC).toMatch(/Fraud-pattern threshold settings unreadable; using built-in defaults/);
    expect(SVC).toMatch(/let countThreshold = 5/);
    expect(SVC).toMatch(/let windowDays = 30/);
    expect(SVC).toMatch(/let favorRateThreshold = 0\.80/);
  });

  it('Number.isFinite guard on the parsed favor-rate (rejects NaN)', () => {
    expect(SVC).toMatch(/if \(!Number\.isFinite\(favorRateThreshold\)\) favorRateThreshold = 0\.80/);
  });
});
