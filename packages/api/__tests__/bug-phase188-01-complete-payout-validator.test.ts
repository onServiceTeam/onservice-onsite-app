// BUG-PHASE188-01 — POST /payouts/:id/complete had no Zod validator
// for paymongoTransferId. Same server-cap shape as Phase 152-168 +
// Phase 179-181.

import { readFileSync } from 'fs';
import { resolve } from 'path';

const ROUTE = readFileSync(
  resolve(__dirname, '../src/routes/payout.routes.ts'),
  'utf8',
);

const VALIDATOR = readFileSync(
  resolve(__dirname, '../src/validators/payout.validators.ts'),
  'utf8',
);

describe('BUG-PHASE188-01 — complete-payout has Zod validation', () => {
  it('defines completePayoutSchema with paymongoTransferId max 100', () => {
    expect(VALIDATOR).toMatch(
      /completePayoutSchema\s*=\s*z\.object\(\{[\s\S]+?paymongoTransferId:\s*z\.string\(\)\.max\(100\)\.optional\(\)/,
    );
  });

  it('imports completePayoutSchema in the route file', () => {
    expect(ROUTE).toMatch(
      /completePayoutSchema/,
    );
  });

  it('applies validationMiddleware(completePayoutSchema) to /:id/complete', () => {
    expect(ROUTE).toMatch(
      /'\/:id\/complete'[\s\S]+?validationMiddleware\(completePayoutSchema\)/,
    );
  });

  it('PHASE188-01 fix-comment is preserved (validator file)', () => {
    expect(VALIDATOR).toMatch(/BUG-PHASE188-01 fix/);
  });

  it('PHASE188-01 fix-comment is preserved (route file)', () => {
    expect(ROUTE).toMatch(/BUG-PHASE188-01 fix/);
  });
});
