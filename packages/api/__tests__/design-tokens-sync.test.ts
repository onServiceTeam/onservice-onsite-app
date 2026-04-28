import { readFileSync } from 'fs';
import { resolve } from 'path';

const REPO_ROOT = resolve(__dirname, '../../..');
const TOKENS_PATH = resolve(REPO_ROOT, 'docs/design-system/tokens.json');
const CSS_PATH = resolve(REPO_ROOT, 'apps/admin/src/index.css');

interface TokenLeaf {
  value: string;
  type?: string;
  description?: string;
}

interface TokensJson {
  color: {
    brand: Record<string, TokenLeaf>;
    status: Record<string, TokenLeaf>;
  };
}

function extractCssVar(css: string, varName: string): string | null {
  const re = new RegExp(`--${varName}\\s*:\\s*(#[0-9A-Fa-f]+)`);
  const m = css.match(re);
  return m ? m[1].toLowerCase() : null;
}

describe('design tokens sync (tokens.json <-> apps/admin/src/index.css)', () => {
  const tokens = JSON.parse(readFileSync(TOKENS_PATH, 'utf8')) as TokensJson;
  const css = readFileSync(CSS_PATH, 'utf8');

  // [tokenValue, cssVarName]
  const pairs: Array<[string, string]> = [
    [tokens.color.brand.primary.value, 'color-primary'],
    [tokens.color.brand['primary-hover'].value, 'color-primary-dark'],
    [tokens.color.brand.secondary.value, 'color-secondary'],
    [tokens.color.brand.accent.value, 'color-accent'],
    [tokens.color.status.success.value, 'color-success'],
    [tokens.color.status.warning.value, 'color-warning'],
    [tokens.color.status.danger.value, 'color-danger'],
  ];

  test.each(pairs)('tokens.json %s matches CSS --%s', (tokenValue, cssVar) => {
    const cssValue = extractCssVar(css, cssVar);
    expect(cssValue).not.toBeNull();
    expect(tokenValue.toLowerCase()).toBe(cssValue);
  });
});
