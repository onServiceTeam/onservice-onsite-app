// BUG-PHASE173-01 — customer recurring/index.tsx empty state had
// no CTA. The hint said "After completing a booking, you can set
// it to repeat automatically" but didn't link to where they'd
// start one. Same UX-gap family as Phase 169/170/172.

import { readFileSync } from 'fs';
import { resolve } from 'path';

const SOURCE = readFileSync(
  resolve(__dirname, '../app/customer/recurring/index.tsx'),
  'utf8',
);

describe('BUG-PHASE173-01 — customer recurring empty has Browse Services CTA', () => {
  it('shows Browse Services CTA in empty state', () => {
    expect(SOURCE).toMatch(
      /emptyCta[\s\S]+?Routes\.TABS\.HOME[\s\S]+?Browse Services/,
    );
  });

  it('PHASE173 fix-comment is preserved', () => {
    expect(SOURCE).toMatch(/BUG-PHASE173-01 fix/);
  });
});
