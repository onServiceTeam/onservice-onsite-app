// BUG-PHASE182-01 — customer recurring detail history empty state
// had no helper text. Same UX-gap family as Phase 169-178.

import { readFileSync } from 'fs';
import { resolve } from 'path';

const SOURCE = readFileSync(
  resolve(__dirname, '../app/customer/recurring/[id].tsx'),
  'utf8',
);

describe('BUG-PHASE182-01 — recurring detail history empty has helper text', () => {
  it('shows the hint about past bookings appearing here', () => {
    expect(SOURCE).toMatch(
      /Past bookings will appear here once they are completed/,
    );
  });

  it('PHASE182-01 fix-comment is preserved', () => {
    expect(SOURCE).toMatch(/BUG-PHASE182-01 fix/);
  });

  it('noInstancesHint style is defined', () => {
    expect(SOURCE).toMatch(/noInstancesHint:\s*\{[\s\S]+?textAlign/);
  });
});
