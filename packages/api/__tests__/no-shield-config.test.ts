// Phase 14 Dispatch 04 — SiguradoShield pull (Option A).
//
// Server-side negative test: the platformConfig export and settings.service
// defaults dict must not contain insurance-shaped keys. Bug 1168 (server
// half) + Bug 538 server cleanup. Gate B parses this file for "Bug NNNN"
// references.
//
// Static-content assertions over the source file (rather than importing
// platformConfig) so the test catches syntactic reintroductions even when
// the config module's runtime shape would not change (e.g., a new
// peso-amount that bypasses the existing TS keys).

import { readFileSync } from 'fs';
import { join } from 'path';

const SRC = join(__dirname, '..', 'src');
function read(rel: string): string {
  return readFileSync(join(SRC, rel), 'utf-8');
}

function commentStripped(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

describe('Bug 1168 (server half) — packages/api/src/config/platform.config.ts', () => {
  const src = commentStripped(read('config/platform.config.ts'));

  it('does not declare an insurance: { ... } block', () => {
    expect(src).not.toMatch(/^\s*insurance\s*:\s*\{/m);
  });

  it('does not declare maxPropertyDamageCoverage', () => {
    expect(src).not.toMatch(/maxPropertyDamageCoverage\s*:/);
  });

  it('does not declare propertyDamageDeductible', () => {
    expect(src).not.toMatch(/propertyDamageDeductible\s*:/);
  });

  it('does not declare maxTheftCoverage / maxInjuryCoverage', () => {
    expect(src).not.toMatch(/maxTheftCoverage\s*:/);
    expect(src).not.toMatch(/maxInjuryCoverage\s*:/);
  });
});

describe('Bug 538 (server half) — packages/api/src/services/settings.service.ts', () => {
  const src = commentStripped(read('services/settings.service.ts'));

  it('defaults dict does not seed max_property_damage_coverage', () => {
    expect(src).not.toMatch(/max_property_damage_coverage\s*:/);
  });

  it('defaults dict does not seed max_theft_coverage / max_injury_coverage', () => {
    expect(src).not.toMatch(/max_theft_coverage\s*:/);
    expect(src).not.toMatch(/max_injury_coverage\s*:/);
  });

  it('defaults dict does not seed claim_window_hours / damage_deductible_*', () => {
    expect(src).not.toMatch(/claim_window_hours\s*:/);
    expect(src).not.toMatch(/damage_deductible_threshold\s*:/);
    expect(src).not.toMatch(/damage_deductible_amount\s*:/);
  });

  it('client-config reader does not surface maxPropertyDamageCoverage etc.', () => {
    expect(src).not.toMatch(/maxPropertyDamageCoverage\s*:/);
    expect(src).not.toMatch(/maxTheftCoverage\s*:/);
    expect(src).not.toMatch(/maxInjuryCoverage\s*:/);
    expect(src).not.toMatch(/claimWindowHours\s*:/);
  });
});
