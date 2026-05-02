// MED-N20 + MED-N30 fix verified.
//
// MED-N20: providers table now has a `tin` column (migration 097)
// with CHECK constraint enforcing canonical PH BIR TIN format.
// bir-2307.service.loadProviderInfo SELECTs it, generateBir2307Pdf
// passes it to the PDF builder. Pre-fix every PDF said
// "[Provider TIN — pending]" because there was no column.
//
// MED-N30: provider-tools.getDemandInsights now passes the
// timezone as a SQL parameter ($N) instead of interpolating
// platformConfig.timezone into the query string. Today's value
// ('Asia/Manila') is hardcoded so the bug was latent, but if
// Phase 17 makes timezone admin-tunable through platform_settings
// the interpolation would have become a live SQL injection.

import { readFileSync } from 'fs';
import { resolve } from 'path';

const SVC_BIR = readFileSync(
  resolve(__dirname, '../src/services/bir-2307.service.ts'),
  'utf8',
);
const SVC_TOOLS = readFileSync(
  resolve(__dirname, '../src/services/provider-tools.service.ts'),
  'utf8',
);
const MIGRATION = readFileSync(
  resolve(__dirname, '../migrations/097_provider_tin.sql'),
  'utf8',
);

describe('MED-N20 — providers.tin column added via migration 097', () => {
  it('migration adds nullable tin TEXT column', () => {
    expect(MIGRATION).toMatch(/ADD COLUMN IF NOT EXISTS tin TEXT/);
  });

  it('CHECK constraint enforces canonical 999-999-999-NNN BIR TIN format', () => {
    expect(MIGRATION).toMatch(/tin ~ '\^\[0-9\]\{3\}-\[0-9\]\{3\}-\[0-9\]\{3\}-\[0-9\]\{3,5\}\$'/);
  });

  it('partial UNIQUE index on populated TINs (nulls allowed)', () => {
    expect(MIGRATION).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS idx_providers_tin[\s\S]*?WHERE tin IS NOT NULL/);
  });

  it('column comment explains MED-N20 + format', () => {
    expect(MIGRATION).toMatch(/COMMENT ON COLUMN providers\.tin IS/);
    expect(MIGRATION).toMatch(/MED-N20 fix/);
  });
});

describe('MED-N20 — bir-2307.service reads + uses provider TIN', () => {
  it('ProviderInfoRow type includes tin field', () => {
    expect(SVC_BIR).toMatch(/MED-N20 fix[\s\S]{0,400}tin: string \| null/);
  });

  it('loadProviderInfo SELECTs the tin column', () => {
    expect(SVC_BIR).toMatch(/SELECT id, business_name, tin FROM providers/);
  });

  it('logs a warning for providers missing TIN (so admin can chase them)', () => {
    expect(SVC_BIR).toMatch(/Provider missing TIN — BIR 2307 PDF will render placeholder/);
  });

  it('PdfProvider tin is populated from providerInfo.tin in batch generation', () => {
    expect(SVC_BIR).toMatch(/MED-N20 fix: pass real TIN through to the PDF builder/);
    expect(SVC_BIR).toMatch(/tin: providerInfo\?\.tin \?\? null/);
  });

  it('PdfProvider tin is populated in regeneration path too', () => {
    expect(SVC_BIR).toMatch(/MED-N20 fix: include TIN on regenerated PDFs/);
    expect(SVC_BIR).toMatch(/tin: providerInfo\.tin \?\? null/);
  });

  it("PDF builder still falls back to '[Provider TIN — pending]' for null TINs", () => {
    // Existing fallback at line 250 stays so the batch job doesn't
    // hard-fail for legacy providers without a TIN.
    expect(SVC_BIR).toMatch(/provider\.tin \?\? '\[Provider TIN — pending\]'/);
  });
});

describe('MED-N30 — provider-tools.getDemandInsights uses parameter binding for timezone', () => {
  it('OLD interpolation pattern is GONE (no template-string ${platformConfig.timezone} inside SQL)', () => {
    const block = SVC_TOOLS.match(/getDemandInsights[\s\S]*?return \{/);
    expect(block).not.toBeNull();
    expect(block![0]).not.toMatch(/AT TIME ZONE '\$\{platformConfig\.timezone\}'/);
  });

  it('NEW parameter binding: AT TIME ZONE $2', () => {
    expect(SVC_TOOLS).toMatch(/EXTRACT\(HOUR FROM b\.scheduled_at AT TIME ZONE \$2\)/);
    expect(SVC_TOOLS).toMatch(/EXTRACT\(DOW FROM b\.scheduled_at AT TIME ZONE \$2\)/);
  });

  it('timezone is the second positional param (after safeDays)', () => {
    expect(SVC_TOOLS).toMatch(/const params: unknown\[\] = \[safeDays, platformConfig\.timezone\]/);
  });

  it('cityClause shifts to $3 (was $2 pre-fix)', () => {
    expect(SVC_TOOLS).toMatch(/cityClause = 'AND b\.city ILIKE \$3'/);
  });

  it('comment documents the latent SQL injection vector', () => {
    expect(SVC_TOOLS).toMatch(/MED-N30 fix.*?SQL.injected/s);
  });
});
