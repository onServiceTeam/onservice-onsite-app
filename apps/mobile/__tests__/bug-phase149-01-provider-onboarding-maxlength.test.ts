// BUG-PHASE149-01 — provider onboarding screens had three text
// inputs without maxLength caps that the server enforces:
//
//   1. apps/mobile/app/provider-onboarding/categories.tsx —
//      businessName (server: providerApplicationSchema.businessName.max(200))
//   2. apps/mobile/app/provider-onboarding/service-area.tsx — City
//      (server: providerApplicationSchema.city.max(100))
//   3. apps/mobile/app/provider-onboarding/service-area.tsx — Province
//      (server: providerApplicationSchema.province.max(100))
//
// Continuation of the Phase 145-148 sweep, but on the provider
// onboarding flow this time. Same fix shape — match server cap.

import { readFileSync } from 'fs';
import { resolve } from 'path';

const CATEGORIES = readFileSync(
  resolve(__dirname, '../app/provider-onboarding/categories.tsx'),
  'utf8',
);
const SERVICE_AREA = readFileSync(
  resolve(__dirname, '../app/provider-onboarding/service-area.tsx'),
  'utf8',
);

describe('BUG-PHASE149-01 — provider-onboarding inputs enforce server caps', () => {
  it('businessName has maxLength={200} (server max(200))', () => {
    expect(CATEGORIES).toMatch(
      /label="Business \/ Professional Name"[\s\S]+?maxLength=\{200\}/,
    );
  });

  it('City has maxLength={100} (server max(100))', () => {
    expect(SERVICE_AREA).toMatch(/label="City"[\s\S]+?maxLength=\{100\}/);
  });

  it('Province has maxLength={100} (server max(100))', () => {
    expect(SERVICE_AREA).toMatch(/label="Province"[\s\S]+?maxLength=\{100\}/);
  });

  it('PHASE149 fix-comments are preserved', () => {
    expect(CATEGORIES).toMatch(/BUG-PHASE149-01 fix/);
    expect(SERVICE_AREA).toMatch(/BUG-PHASE149-01 fix/);
  });
});
