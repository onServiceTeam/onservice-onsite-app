// BUG-PHASE167-01 — catalog deleteSubcategory + deleteAddon accepted
// unbounded reason. The reason column gets a 500-char slice but
// admin_actions.full_notes (TEXT, unbounded) gets the entire string.
//
// Cap at 2000 to prevent unbounded full_notes inserts. Same
// defense-in-depth pattern as Phase 152-166.

import { readFileSync } from 'fs';
import { resolve } from 'path';

const SOURCE = readFileSync(
  resolve(__dirname, '../src/services/catalog.service.ts'),
  'utf8',
);

describe('BUG-PHASE167-01 — catalog delete reason cap', () => {
  it('deleteSubcategory + deleteAddon cap reason at 2000 (≥ 2 sites)', () => {
    const matches = SOURCE.match(
      /reason\.length > 2000[\s\S]+?reason must be ≤ 2000 characters/g,
    );
    expect(matches).not.toBeNull();
    expect(matches!.length).toBeGreaterThanOrEqual(2);
  });

  it('PHASE167 fix-comment is preserved', () => {
    expect(SOURCE).toMatch(/BUG-PHASE167-01 fix/);
  });
});
