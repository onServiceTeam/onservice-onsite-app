// BUG-PHASE199-01 — PUT /wallet/payout-preferences had no Zod
// validator; destinationAccount was passed through to a VARCHAR(255)
// column with no length cap. Same shape as Phase 188.

import { readFileSync } from 'fs';
import { resolve } from 'path';

const VALIDATOR = readFileSync(
  resolve(__dirname, '../src/validators/wallet.validators.ts'),
  'utf8',
);

const ROUTE = readFileSync(
  resolve(__dirname, '../src/routes/wallet.routes.ts'),
  'utf8',
);

describe('BUG-PHASE199-01 — payout-preferences route is validated', () => {
  it('defines updatePayoutPreferencesSchema with destinationAccount max 255', () => {
    expect(VALIDATOR).toMatch(
      /updatePayoutPreferencesSchema\s*=\s*z\.object\(\{[\s\S]+?destinationAccount:\s*z\.string\(\)\.max\(255\)\.optional\(\)/,
    );
  });

  it('imports and applies updatePayoutPreferencesSchema in the PUT route', () => {
    expect(ROUTE).toMatch(/updatePayoutPreferencesSchema/);
    expect(ROUTE).toMatch(
      /'\/payout-preferences'[\s\S]+?validationMiddleware\(updatePayoutPreferencesSchema\)/,
    );
  });

  it('PHASE199-01 fix-comment is preserved (validator)', () => {
    expect(VALIDATOR).toMatch(/BUG-PHASE199-01 fix/);
  });

  it('PHASE199-01 fix-comment is preserved (route)', () => {
    expect(ROUTE).toMatch(/BUG-PHASE199-01 fix/);
  });
});
