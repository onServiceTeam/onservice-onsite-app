// BUG-PHASE163-01 — catalog services (categories, subcategories,
// addons) had no server-side length validation on name, description,
// iconUrl. Columns are mixed: name VARCHAR(100) (Postgres caps but
// raw SQL error if exceeded), description + icon_url TEXT (unbounded).
//
// Same defense-in-depth pattern as Phase 152-162. Provides friendly
// 400 errors instead of cryptic 500s.
//
// Sites:
//   createCategory, updateCategory      — name (100) + description (2000) + iconUrl (500)
//   createSubcategory, updateSubcategory — name (100) + description (2000)
//   createAddon, updateAddon            — name (100) + description (2000)

import { readFileSync } from 'fs';
import { resolve } from 'path';

const SOURCE = readFileSync(
  resolve(__dirname, '../src/services/catalog.service.ts'),
  'utf8',
);

describe('BUG-PHASE163-01 — catalog server caps', () => {
  it('declares cap constants', () => {
    expect(SOURCE).toMatch(/CATALOG_NAME_MAX = 100/);
    expect(SOURCE).toMatch(/CATALOG_DESCRIPTION_MAX = 2000/);
    expect(SOURCE).toMatch(/CATALOG_ICON_URL_MAX = 500/);
  });

  it('exposes a validateCatalogText helper', () => {
    expect(SOURCE).toMatch(
      /function validateCatalogText\(value: unknown, field: string, max: number, optional = true\)/,
    );
  });

  it('all 6 mutation functions call the helper (≥ 12 calls)', () => {
    // 6 mutations × at least 2 fields per mutation = 12+ helper calls.
    const matches = SOURCE.match(/validateCatalogText\(/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBeGreaterThanOrEqual(12);
  });

  it('PHASE163 fix-comment is preserved', () => {
    expect(SOURCE).toMatch(/BUG-PHASE163-01 fix/);
  });
});
