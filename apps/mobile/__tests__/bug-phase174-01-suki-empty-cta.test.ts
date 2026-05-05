// BUG-PHASE174-01 — customer/suki-pros.tsx empty state had no CTA.
// Same UX-gap family as Phase 169/170/172/173.

import { readFileSync } from 'fs';
import { resolve } from 'path';

const SOURCE = readFileSync(
  resolve(__dirname, '../app/customer/suki-pros.tsx'),
  'utf8',
);

describe('BUG-PHASE174-01 — customer suki-pros empty has Browse Services CTA', () => {
  it('shows Browse Services CTA in empty state', () => {
    expect(SOURCE).toMatch(
      /emptyCta[\s\S]+?'\/\(tabs\)\/home'[\s\S]+?Browse Services/,
    );
  });

  it('PHASE174 fix-comment is preserved', () => {
    expect(SOURCE).toMatch(/BUG-PHASE174-01 fix/);
  });
});
