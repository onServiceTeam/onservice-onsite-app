// BUG-PHASE198-01 — provider-onboarding documents.tsx had no
// maxLength on nbiExpiryDate and governmentIdNumber fields.

import { readFileSync } from 'fs';
import { resolve } from 'path';

const SOURCE = readFileSync(
  resolve(__dirname, '../app/provider-onboarding/documents.tsx'),
  'utf8',
);

describe('BUG-PHASE198-01 — onboarding documents form caps match server', () => {
  it('nbiExpiryDate TextInput has maxLength=10 (YYYY-MM-DD)', () => {
    expect(SOURCE).toMatch(
      /value=\{store\.nbiExpiryDate[\s\S]+?maxLength=\{10\}/,
    );
  });

  it('governmentIdNumber TextInput has maxLength=64 (matches Zod)', () => {
    expect(SOURCE).toMatch(
      /value=\{store\.governmentIdNumber[\s\S]+?maxLength=\{64\}/,
    );
  });

  it('PHASE198-01 fix-comment is preserved', () => {
    expect(SOURCE).toMatch(/BUG-PHASE198-01 fix/);
  });
});
