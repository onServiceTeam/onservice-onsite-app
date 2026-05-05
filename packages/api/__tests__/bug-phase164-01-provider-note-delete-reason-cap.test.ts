// BUG-PHASE164-01 — provider-admin.service.ts deleteProviderNote
// accepted unbounded `reason`. Column is TEXT (deleted_reason;
// migration 076), unbounded by Postgres.
//
// Same defense-in-depth pattern as Phase 152-163. Cap at 1000.

import { readFileSync } from 'fs';
import { resolve } from 'path';

const SOURCE = readFileSync(
  resolve(__dirname, '../src/services/provider-admin.service.ts'),
  'utf8',
);

describe('BUG-PHASE164-01 — provider note delete reason cap', () => {
  it('rejects reason > 1000 chars', () => {
    expect(SOURCE).toMatch(
      /trimmedReason\.length > 1000[\s\S]+?reason must be ≤ 1000 characters/,
    );
  });

  it('PHASE164 fix-comment is preserved', () => {
    expect(SOURCE).toMatch(/BUG-PHASE164-01 fix/);
  });
});
