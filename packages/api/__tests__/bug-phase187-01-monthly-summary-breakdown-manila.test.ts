// BUG-PHASE187-01 — provider monthly-summary breakdown row date
// used UTC-anchored confirmed_at, off-by-one for early-Manila-
// morning confirmations. Same pattern as Phase 117/119/120/185/186.

import { readFileSync } from 'fs';
import { resolve } from 'path';

const SOURCE = readFileSync(
  resolve(__dirname, '../src/services/provider-tools.service.ts'),
  'utf8',
);

describe('BUG-PHASE187-01 — monthly-summary breakdown date uses Manila TZ', () => {
  it('formats dateValue in Asia/Manila for the breakdown row', () => {
    expect(SOURCE).toMatch(
      /manilaDate\s*=\s*new Intl\.DateTimeFormat\('en-CA',[\s\S]+?'Asia\/Manila'[\s\S]+?\.format\(dateValue\)/,
    );
  });

  it('PHASE187-01 fix-comment is preserved', () => {
    expect(SOURCE).toMatch(/BUG-PHASE187-01 fix/);
  });

  it('does not still emit the raw dateValue.toISOString().split for the date field', () => {
    expect(SOURCE).not.toMatch(
      /date:\s*dateValue\.toISOString\(\)\.split\('T'\)\[0\]/,
    );
  });
});
