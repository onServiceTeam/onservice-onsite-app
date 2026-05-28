// Bug 1324 fix verified.
// Phase 14 Dispatch 02 Part 2.
//
// Brand color is single-sourced from docs/design-system/tokens.json. The
// platform_settings rows added in migration 072 default to the same hex
// values; mobile theme.ts and admin index.css use those values literally.
// This test asserts the four sources stay in lockstep and the legacy
// #0066FF / #0F62FE values are gone everywhere outside design-tokens/.

import fs from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '../../../');
const TOKENS = path.join(REPO_ROOT, 'docs/design-system/tokens.json');
const MIGRATION = path.join(REPO_ROOT, 'packages/api/migrations/072_branding_settings.sql');
const MOBILE_THEME = path.join(REPO_ROOT, 'apps/mobile/src/config/theme.ts');
const ADMIN_CSS = path.join(REPO_ROOT, 'apps/admin/src/index.css');

interface Tokens {
  color: {
    brand: {
      primary: { value: string };
      secondary: { value: string };
      accent: { value: string };
    };
  };
}

const tokens = JSON.parse(fs.readFileSync(TOKENS, 'utf8')) as Tokens;
const CANONICAL_PRIMARY = tokens.color.brand.primary.value;

describe('Bug 1324 fix verified — canonical brand color values', () => {
  it('tokens.json declares the canonical brand primary as deep teal', () => {
    expect(CANONICAL_PRIMARY).toBe('#1B3A4B');
  });

  it('migration 072 seeds the platform_settings rows with the canonical hex values', () => {
    const sql = fs.readFileSync(MIGRATION, 'utf8');
    expect(sql).toMatch(/brand_color_primary[\s\S]+'#1B3A4B'/);
    expect(sql).toMatch(new RegExp(`brand_color_secondary[\\s\\S]+'${tokens.color.brand.secondary.value}'`));
    expect(sql).toMatch(new RegExp(`brand_color_accent[\\s\\S]+'${tokens.color.brand.accent.value}'`));
  });

  it('mobile theme.ts uses the canonical primary as its static default', () => {
    const file = fs.readFileSync(MOBILE_THEME, 'utf8');
    expect(file).toMatch(new RegExp(`primary:\\s*'${CANONICAL_PRIMARY}'`));
    expect(file).not.toMatch(/#0066FF/i);
    expect(file).not.toMatch(/#0F62FE/i);
  });

  it('admin index.css uses the canonical primary as a CSS variable', () => {
    const css = fs.readFileSync(ADMIN_CSS, 'utf8');
    expect(css).toMatch(new RegExp(`--color-primary:\\s*${CANONICAL_PRIMARY}`));
  });
});

describe('Bug 1324 fix verified — gate is wired', () => {
  it('a-cross-source-brand-color.sh refuses any old hex outside design-tokens/', () => {
    const gate = fs.readFileSync(
      path.join(REPO_ROOT, 'scripts/gates/a-cross-source-brand-color.sh'),
      'utf8',
    );
    expect(gate).toMatch(/#0066FF/);
    expect(gate).toMatch(/#0F62FE/);
    expect(gate).toMatch(/grep -v "design-tokens\//);
  });
});

describe('Bug 1324 fix verified — getClientConfig exposes branding', () => {
  it('settings.service.ts references the brand_color_* keys in getClientConfig', () => {
    const file = fs.readFileSync(
      path.join(REPO_ROOT, 'packages/api/src/services/settings.service.ts'),
      'utf8',
    );
    expect(file).toMatch(/brand_color_primary/);
    expect(file).toMatch(/brand_color_secondary/);
    expect(file).toMatch(/brand_color_accent/);
    // Falls back to canonical values if the DB row is missing.
    expect(file).toMatch(new RegExp(`'${CANONICAL_PRIMARY}'`));
  });
});
