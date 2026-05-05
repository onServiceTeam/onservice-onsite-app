// BUG-PHASE184-01 — customer category subcategory list empty state
// was a dead-end. Same UX-gap family as Phase 169-178.

import { readFileSync } from 'fs';
import { resolve } from 'path';

const SOURCE = readFileSync(
  resolve(__dirname, '../app/customer/category/[id].tsx'),
  'utf8',
);

describe('BUG-PHASE184-01 — customer category empty has Browse Other Categories CTA', () => {
  it('shows Browse Other Categories CTA in empty state', () => {
    expect(SOURCE).toMatch(
      /emptyCta[\s\S]+?Routes\.TABS\.HOME[\s\S]+?Browse Other Categories/,
    );
  });

  it('shows the helper hint about providers coming online', () => {
    expect(SOURCE).toMatch(
      /Check back soon[\s\S]+?providers in this category may be coming online/,
    );
  });

  it('PHASE184-01 fix-comment is preserved', () => {
    expect(SOURCE).toMatch(/BUG-PHASE184-01 fix/);
  });
});
