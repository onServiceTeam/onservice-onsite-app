// BUG-PHASE192-01 — createBusinessAccount accepted unbounded
// company_name / contact_* / registration_number / tax_id /
// billing_address / notes. Same server-cap shape as Phase
// 152-168 + 179-181 + 188-191.

import { readFileSync } from 'fs';
import { resolve } from 'path';

const SOURCE = readFileSync(
  resolve(__dirname, '../src/services/business.service.ts'),
  'utf8',
);

describe('BUG-PHASE192-01 — createBusinessAccount caps text fields', () => {
  it('caps companyName at 200', () => {
    expect(SOURCE).toMatch(
      /companyName\.length\s*>\s*200[\s\S]+?must be ≤ 200/,
    );
  });

  it('caps contactPerson at 200', () => {
    expect(SOURCE).toMatch(
      /contactPerson\.length\s*>\s*200[\s\S]+?must be ≤ 200/,
    );
  });

  it('caps contactEmail at 255', () => {
    expect(SOURCE).toMatch(
      /contactEmail\.length\s*>\s*255[\s\S]+?must be ≤ 255/,
    );
  });

  it('caps registrationNumber at 100', () => {
    expect(SOURCE).toMatch(
      /registrationNumber[\s\S]+?length\s*>\s*100[\s\S]+?must be ≤ 100/,
    );
  });

  it('caps taxId at 50', () => {
    expect(SOURCE).toMatch(
      /taxId[\s\S]+?length\s*>\s*50[\s\S]+?must be ≤ 50/,
    );
  });

  it('caps contactPhone at 20', () => {
    expect(SOURCE).toMatch(
      /contactPhone\.length\s*>\s*20[\s\S]+?must be ≤ 20/,
    );
  });

  it('caps billingAddress at 1000', () => {
    expect(SOURCE).toMatch(
      /billingAddress\.length\s*>\s*1000[\s\S]+?must be ≤ 1000/,
    );
  });

  it('caps notes at 5000', () => {
    expect(SOURCE).toMatch(
      /notes[\s\S]+?length\s*>\s*5000[\s\S]+?must be ≤ 5000/,
    );
  });

  it('PHASE192-01 fix-comment is preserved', () => {
    expect(SOURCE).toMatch(/BUG-PHASE192-01 fix/);
  });
});
