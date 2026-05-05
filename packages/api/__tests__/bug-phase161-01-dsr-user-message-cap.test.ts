// BUG-PHASE161-01 — DSR (RA 10173 Data Subject Request) creation
// accepted unbounded `userMessage`. Column is TEXT (migration 057
// data_subject_requests.user_message), unbounded by Postgres.
//
// Customer-facing endpoint authenticated but rate-limited. Same
// defense-in-depth pattern as Phase 152-160.
// Cap at 5000 chars (free-form message to DPO).

import { readFileSync } from 'fs';
import { resolve } from 'path';

const SOURCE = readFileSync(
  resolve(__dirname, '../src/services/compliance.service.ts'),
  'utf8',
);

describe('BUG-PHASE161-01 — DSR userMessage server cap', () => {
  it('rejects userMessage > 5000 chars', () => {
    expect(SOURCE).toMatch(
      /input\.userMessage\.length > 5000[\s\S]+?userMessage must be ≤ 5000 characters/,
    );
  });

  it('PHASE161 fix-comment is preserved', () => {
    expect(SOURCE).toMatch(/BUG-PHASE161-01 fix/);
  });
});
