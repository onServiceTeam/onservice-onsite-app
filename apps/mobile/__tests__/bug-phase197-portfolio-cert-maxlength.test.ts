// BUG-PHASE197-01/02 — provider portfolio caption + certifications
// form fields had no maxLength matching Phase 152 server caps.

import { readFileSync } from 'fs';
import { resolve } from 'path';

const PORTFOLIO = readFileSync(
  resolve(__dirname, '../app/provider/portfolio.tsx'),
  'utf8',
);

const CERTS = readFileSync(
  resolve(__dirname, '../app/provider/certifications.tsx'),
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

describe('BUG-PHASE197-02 — certifications form caps match Phase 152 server caps', () => {
  it('Certification Name TextInput has maxLength=200', () => {
    expect(CERTS).toMatch(
      /value=\{name\}[\s\S]+?maxLength=\{200\}/,
    );
  });

  it('Issuing Body TextInput has maxLength=200', () => {
    expect(CERTS).toMatch(
      /value=\{issuingBody\}[\s\S]+?maxLength=\{200\}/,
    );
  });

  it('Certificate Number TextInput has maxLength=100', () => {
    expect(CERTS).toMatch(
      /value=\{certNumber\}[\s\S]+?maxLength=\{100\}/,
    );
  });

  it('PHASE197-02 fix-comment is preserved', () => {
    expect(CERTS).toMatch(/BUG-PHASE197-02 fix/);
  });
});
