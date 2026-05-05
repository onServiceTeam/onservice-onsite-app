// BUG-PHASE176-01 — customer search empty state had no CTA.
// Same UX-gap family as Phase 169/170/172/173/174/175.

import { readFileSync } from 'fs';
import { resolve } from 'path';

const SOURCE = readFileSync(
  resolve(__dirname, '../app/customer/search.tsx'),
  'utf8',
);

describe('BUG-PHASE176-01 — customer search empty has Browse Categories CTA', () => {
  it('shows Browse Categories CTA in empty state', () => {
    expect(SOURCE).toMatch(
      /emptyCta[\s\S]+?Routes\.TABS\.HOME[\s\S]+?Browse Categories/,
    );
  });

  it('PHASE176 fix-comment is preserved', () => {
    expect(SOURCE).toMatch(/BUG-PHASE176-01 fix/);
  });
});
