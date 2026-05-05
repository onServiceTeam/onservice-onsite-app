// BUG-PHASE156-01 — POST /api/v1/account/deletion accepts a `reason`
// field with no server-side length cap. Column is TEXT so Postgres
// has no DB-side bound. Same defense-in-depth pattern as Phase
// 152/153/154/155 — the column type doesn't backstop, so the route
// must.
//
// Cap: 1000 chars (consistent with the 1000-char convention used
// for other "optional reason / notes" inputs in this codebase).
//
// Test strategy: source-content regression on the route file.

import { readFileSync } from 'fs';
import { resolve } from 'path';

const SOURCE = readFileSync(
  resolve(__dirname, '../src/routes/account.routes.ts'),
  'utf8',
);

describe('BUG-PHASE156-01 — account deletion reason cap', () => {
  it('declares ACCOUNT_DELETION_REASON_MAX = 1000', () => {
    expect(SOURCE).toMatch(/ACCOUNT_DELETION_REASON_MAX = 1000/);
  });

  it('rejects reason > 1000 chars', () => {
    expect(SOURCE).toMatch(
      /reason\.length > ACCOUNT_DELETION_REASON_MAX[\s\S]+?must be ≤ \$\{ACCOUNT_DELETION_REASON_MAX\} characters/,
    );
  });

  it('PHASE156 fix-comment is preserved', () => {
    expect(SOURCE).toMatch(/BUG-PHASE156-01 fix/);
  });
});
