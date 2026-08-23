// BUG-PHASE197-01/02 — provider portfolio caption + certifications
// form fields had no maxLength matching Phase 152 server caps.

import { readFileSync } from 'fs';
import { resolve } from 'path';

const PORTFOLIO = readFileSync(
  resolve(__dirname, '../app/provider/portfolio.tsx'),
  'utf8',
);

describe('BUG-PHASE197-01 — portfolio caption capped at 500', () => {
  it('caption TextInput has maxLength=500', () => {
    expect(PORTFOLIO).toMatch(
      /value=\{caption\}[\s\S]+?maxLength=\{500\}/,
    );
  });

  it('PHASE197-01 fix-comment is preserved', () => {
    expect(PORTFOLIO).toMatch(/BUG-PHASE197-01 fix/);
  });
});
