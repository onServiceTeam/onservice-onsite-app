// BUG-PHASE183-01 — provider services empty state had no embedded
// CTA. Same UX-gap family as Phase 169-178.

import { readFileSync } from 'fs';
import { resolve } from 'path';

const SOURCE = readFileSync(
  resolve(__dirname, '../app/provider/services.tsx'),
  'utf8',
);

describe('BUG-PHASE183-01 — provider services empty has Add Your First Service CTA', () => {
  it('shows Add Your First Service CTA in empty state', () => {
    expect(SOURCE).toMatch(
      /emptyCta[\s\S]+?setShowAdd\(true\)[\s\S]+?Add Your First Service/,
    );
  });

  it('PHASE183-01 fix-comment is preserved', () => {
    expect(SOURCE).toMatch(/BUG-PHASE183-01 fix/);
  });
});
