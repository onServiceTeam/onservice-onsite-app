// BUG-PHASE93-01 — admin CatalogPage price conversion uses Math.round.
//
// Pre-fix the subcategory create/edit form converted prices with
// `Number(x) * 100` and sent the result raw. JS floating-point
// produces values like `500.55 * 100 === 50055.00000000001`.
// service_subcategories.base_price is INTEGER (centavos, per
// migration 003), so Postgres rejects the non-integer parameter
// with "invalid input syntax for type integer". An admin entering
// any price not on a 0.50 boundary (e.g. ₱500.55, ₱123.45) saw an
// opaque server error and had to retry until they happened to pick
// a "safe" decimal.
//
// Fix: extract a toCentavos() helper that rounds to the nearest
// centavo before submit. Empty input still maps to null (so a
// quote-based subcategory can be saved without a base price).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const CATALOG = readFileSync(
  resolve(__dirname, '../CatalogPage.tsx'),
  'utf8',
);

describe('BUG-PHASE93-01 — admin CatalogPage subcategory prices use Math.round', () => {
  it('BUG-PHASE93-01 — pre-fix `Number(basePrice) * 100` (no round) is gone', () => {
    expect(CATALOG).not.toMatch(/basePrice: basePrice \? Number\(basePrice\) \* 100 : null/);
    expect(CATALOG).not.toMatch(/minPrice: minPrice \? Number\(minPrice\) \* 100 : null/);
    expect(CATALOG).not.toMatch(/maxPrice: maxPrice \? Number\(maxPrice\) \* 100 : null/);
  });

  it('BUG-PHASE93-01 — toCentavos helper exists and uses Math.round on n*100', () => {
    expect(CATALOG).toMatch(/const toCentavos = \(raw: string\): number \| null =>/);
    expect(CATALOG).toMatch(/Math\.round\(n \* 100\)/);
  });

  it('BUG-PHASE93-01 — toCentavos returns null for empty / non-finite input', () => {
    // Empty string → null lets a quote-based subcategory submit without a base price.
    expect(CATALOG).toMatch(/if \(!raw\) return null/);
    expect(CATALOG).toMatch(/if \(!Number\.isFinite\(n\)\) return null/);
  });

  it('BUG-PHASE93-01 — subcategory body uses toCentavos for all 3 price fields', () => {
    expect(CATALOG).toMatch(/basePrice: toCentavos\(basePrice\)/);
    expect(CATALOG).toMatch(/minPrice: toCentavos\(minPrice\)/);
    expect(CATALOG).toMatch(/maxPrice: toCentavos\(maxPrice\)/);
  });
});
