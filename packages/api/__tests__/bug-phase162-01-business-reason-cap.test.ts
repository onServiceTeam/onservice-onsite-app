// BUG-PHASE162-01 — business removeMember + transferOwnership
// accepted unbounded `reason`. Column is TEXT (deleted_reason from
// migration 076), unbounded by Postgres.
//
// Same defense-in-depth pattern as Phase 152-161. Cap at 1000 chars.

import { readFileSync } from 'fs';
import { resolve } from 'path';

const SOURCE = readFileSync(
  resolve(__dirname, '../src/services/business.service.ts'),
  'utf8',
);

describe('BUG-PHASE162-01 — business reason caps', () => {
  it('removeMember + transferOwnership cap reason at 1000 chars (≥ 2 sites)', () => {
    const matches = SOURCE.match(
      /reason\.length > 1000[\s\S]+?reason must be ≤ 1000 characters/g,
    );
    expect(matches).not.toBeNull();
    expect(matches!.length).toBeGreaterThanOrEqual(2);
  });

  it('PHASE162 fix-comment is preserved', () => {
    expect(SOURCE).toMatch(/BUG-PHASE162-01 fix/);
  });
});
