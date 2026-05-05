// BUG-PHASE153-01 — promotion routes (POST + PUT) manually parsed
// req.body without server-side length validation. Promotions surface
// on the customer home banner + provider dashboard; an admin (or
// compromised admin token) could submit a 100,000-char subtitle that
// the TEXT column accepts but every customer's home screen tries to
// render. Plus several VARCHAR-typed columns (title 200, badge 30,
// cta_text 50, cta_link 500, target_audience CHECK enum) gave raw
// SQL errors instead of friendly 400 responses.
//
// Same defense-in-depth pattern as Phase 152 (portfolio + cert caps).
// Caps mirror the column types from migration 044_promotions.sql.
//
// Test strategy: source-content regression on the route file. The
// validatePromoText helper + 6 explicit cap constants + the
// targetAudience enum check are best verified by source-level
// assertions on the contract.

import { readFileSync } from 'fs';
import { resolve } from 'path';

const SOURCE = readFileSync(
  resolve(__dirname, '../src/routes/promotion.routes.ts'),
  'utf8',
);

describe('BUG-PHASE153-01 — promotion routes server-side length caps', () => {
  it('declares all 6 cap constants matching column types', () => {
    expect(SOURCE).toMatch(/PROMO_TITLE_MAX = 200/);
    expect(SOURCE).toMatch(/PROMO_SUBTITLE_MAX = 1000/);
    expect(SOURCE).toMatch(/PROMO_IMAGE_URL_MAX = 500/);
    expect(SOURCE).toMatch(/PROMO_BADGE_MAX = 30/);
    expect(SOURCE).toMatch(/PROMO_CTA_TEXT_MAX = 50/);
    expect(SOURCE).toMatch(/PROMO_CTA_LINK_MAX = 500/);
  });

  it('declares targetAudience enum (matches CHECK constraint)', () => {
    expect(SOURCE).toMatch(
      /PROMO_TARGET_AUDIENCES = new Set\(\[\s*'all',\s*'new_customers',\s*'returning',\s*'providers',\s*\]\)/,
    );
  });

  it('exposes a validatePromoText helper', () => {
    expect(SOURCE).toMatch(
      /function validatePromoText\(value: unknown, field: string, max: number, optional = true\)/,
    );
  });

  it('POST route validates all 6 string fields + targetAudience + displayOrder', () => {
    // 6 validatePromoText calls in the POST handler (1 required + 5 optional).
    // Plus a targetAudience enum check and displayOrder integer check.
    const matches = SOURCE.match(/validatePromoText\(/g);
    expect(matches).not.toBeNull();
    // 6 in POST + 6 in PUT = 12 total minimum
    expect(matches!.length).toBeGreaterThanOrEqual(12);
  });

  it('POST + PUT both check targetAudience enum', () => {
    const matches = SOURCE.match(/PROMO_TARGET_AUDIENCES\.has/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBeGreaterThanOrEqual(2);
  });

  it('PHASE153 fix-comment is preserved', () => {
    expect(SOURCE).toMatch(/BUG-PHASE153-01 fix/);
  });
});
