// BUG-PHASE189-01 — admin updateProviderProfile had no length caps
// on businessName / description. Same server-cap shape as Phase
// 152-168 + 179-181 + 188.

import { readFileSync } from 'fs';
import { resolve } from 'path';

const SOURCE = readFileSync(
  resolve(__dirname, '../src/services/provider-admin.service.ts'),
  'utf8',
);

describe('BUG-PHASE189-01 — updateProviderProfile caps text fields', () => {
  it('caps businessName at 200 characters', () => {
    expect(SOURCE).toMatch(
      /v\.length\s*>\s*200[\s\S]+?businessName must be ≤ 200 characters/,
    );
  });

  it('caps description at 5000 characters', () => {
    expect(SOURCE).toMatch(
      /patch\.description\.length\s*>\s*5000[\s\S]+?description must be ≤ 5000 characters/,
    );
  });

  it('PHASE189-01 fix-comment is preserved', () => {
    expect(SOURCE).toMatch(/BUG-PHASE189-01 fix/);
  });
});
