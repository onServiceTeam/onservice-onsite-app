// BUG-PHASE177-01 — wallet empty state was filter-blind.
// Same UX-gap family as Phase 169-176.

import { readFileSync } from 'fs';
import { resolve } from 'path';

const SOURCE = readFileSync(
  resolve(__dirname, '../app/(tabs)/wallet.tsx'),
  'utf8',
);

describe('BUG-PHASE177-01 — wallet empty state is filter-aware', () => {
  it('distinguishes truly-empty from filter-empty', () => {
    expect(SOURCE).toMatch(
      /allTransactions\.length === 0[\s\S]+?'No transactions yet'[\s\S]+?txFilter/,
    );
    expect(SOURCE).toMatch(/in this view/);
  });

  it('shows top-up hint only when truly empty', () => {
    expect(SOURCE).toMatch(
      /allTransactions\.length === 0\s*&&[\s\S]+?Top up your wallet/,
    );
  });

  it('PHASE177 fix-comment is preserved', () => {
    expect(SOURCE).toMatch(/BUG-PHASE177-01 fix/);
  });
});
