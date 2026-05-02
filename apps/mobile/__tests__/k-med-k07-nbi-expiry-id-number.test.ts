// Phase K MED-K07 — capture NBI expiry + ID number during onboarding.
//
// Source-shape tests covering both ends of the wire:
//   - mobile onboarding store has the new fields + setters
//   - mobile documents.tsx exposes the inputs
//   - mobile terms.tsx forwards them on submit (only when set)
// Backend-side tests live in packages/api/__tests__/k-med-k07-provider-application.test.ts.

import { readFileSync } from 'fs';
import { resolve } from 'path';

const STORE = readFileSync(
  resolve(__dirname, '../src/stores/onboarding.store.ts'),
  'utf8',
);
const DOCUMENTS = readFileSync(
  resolve(__dirname, '../app/provider-onboarding/documents.tsx'),
  'utf8',
);
const TERMS = readFileSync(
  resolve(__dirname, '../app/provider-onboarding/terms.tsx'),
  'utf8',
);

describe('Phase K MED-K07 — onboarding store carries nbiExpiryDate + governmentIdNumber', () => {
  it('K07 — store interface has nbiExpiryDate field', () => {
    expect(STORE).toMatch(/nbiExpiryDate: string \| null/);
  });
  it('K07 — store interface has governmentIdNumber field', () => {
    expect(STORE).toMatch(/governmentIdNumber: string \| null/);
  });
  it('K07 — store has setNbiExpiryDate setter', () => {
    expect(STORE).toMatch(/setNbiExpiryDate: \(date: string \| null\) => void/);
    expect(STORE).toMatch(/setNbiExpiryDate: \(date\) => set\(\{ nbiExpiryDate: date \}\)/);
  });
  it('K07 — store has setGovernmentIdNumber setter', () => {
    expect(STORE).toMatch(/setGovernmentIdNumber: \(idNumber: string \| null\) => void/);
    expect(STORE).toMatch(/setGovernmentIdNumber: \(idNumber\) => set\(\{ governmentIdNumber: idNumber \}\)/);
  });
});

describe('Phase K MED-K07 — documents.tsx exposes the new inputs', () => {
  it('K07 — NBI Expiry Date label rendered', () => {
    expect(DOCUMENTS).toMatch(/NBI Expiry Date \(optional\)/);
  });
  it('K07 — Government ID Number label rendered', () => {
    expect(DOCUMENTS).toMatch(/Government ID Number \(optional\)/);
  });
  it('K07 — input wired to store.setNbiExpiryDate', () => {
    expect(DOCUMENTS).toMatch(/store\.setNbiExpiryDate\(v\.length === 0 \? null : v\)/);
  });
  it('K07 — input wired to store.setGovernmentIdNumber', () => {
    expect(DOCUMENTS).toMatch(/store\.setGovernmentIdNumber\(v\.length === 0 \? null : v\)/);
  });
});

describe('Phase K MED-K07 — terms.tsx forwards optional fields on submit', () => {
  it('K07 — nbiExpiryDate spread only when set', () => {
    expect(TERMS).toMatch(/store\.nbiExpiryDate \? \{ nbiExpiryDate: store\.nbiExpiryDate \} : \{\}/);
  });
  it('K07 — governmentIdNumber spread only when set', () => {
    expect(TERMS).toMatch(/store\.governmentIdNumber \? \{ governmentIdNumber: store\.governmentIdNumber \} : \{\}/);
  });
});
