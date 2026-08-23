// Bug 1324 fix verified.
// Phase 14 Dispatch 02 Part 2.
//
// Brand color is single-sourced from docs/design-system/tokens.json. Migration
// 146 supersedes the historical migration 072 defaults with Ken's approved
// August 2026 Stitch palette. Mobile theme.ts, app config, admin index.css,
// and the public client-config fallback use those values literally.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const REPO_ROOT = path.resolve(__dirname, '../../../');
const TOKENS = path.join(REPO_ROOT, 'docs/design-system/tokens.json');
const MIGRATION = path.join(REPO_ROOT, 'packages/api/migrations/146_stitch_brand_palette.sql');
const MOBILE_THEME = path.join(REPO_ROOT, 'apps/mobile/src/config/theme.ts');
const MOBILE_CONFIG = path.join(REPO_ROOT, 'apps/mobile/app.config.ts');
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

describe('Bug UX-018 — Stitch palette stays canonical across clients and server', () => {
  it('tokens.json declares the approved Stitch deep-blue primary', () => {
    expect(CANONICAL_PRIMARY).toBe('#003D9B');
  });

  it('migration 146 updates all platform branding rows to the canonical values', () => {
    const sql = fs.readFileSync(MIGRATION, 'utf8');
    expect(sql).toMatch(/brand_color_primary[\s\S]+'#003D9B'/);
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
    expect(css).toMatch(new RegExp(`--color-primary:\\s*${CANONICAL_PRIMARY}`, 'i'));
  });

  it('native app chrome uses the canonical primary', () => {
    const config = fs.readFileSync(MOBILE_CONFIG, 'utf8');
    expect(config).toContain(CANONICAL_PRIMARY);
    expect(config).not.toMatch(/#1B3A4B/i);
  });
});

describe('Bug UX-018 — brand gate behavior', () => {
  it('rejects a source scan that reports a superseded application color', () => {
    const result = spawnSync(
      'bash',
      [
        '-c',
        "git() { printf '%s\\n' \"apps/example/theme.ts:1:export const primary = '#0F62FE';\"; return 0; }; source scripts/gates/a-cross-source-brand-color.sh",
      ],
      { cwd: REPO_ROOT, encoding: 'utf8' },
    );
    const output = `${result.stdout}${result.stderr}`;
    if (result.status !== 1) {
      throw new Error(`brand gate exited ${String(result.status)} instead of 1:\n${output}`);
    }
    expect(output).toContain('GATE A VIOLATION');
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
