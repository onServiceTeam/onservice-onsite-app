// BUG-PHASE172-01 — provider Payout History screen had no link to
// the Withdraw screen. Provider had to navigate back to the
// Earnings tab to request a new withdrawal.
//
// Same UX-gap family as Phase 169-170. Fix: add Request Withdrawal
// CTA in the header for direct access.

import { readFileSync } from 'fs';
import { resolve } from 'path';

const SOURCE = readFileSync(
  resolve(__dirname, '../app/provider/payouts.tsx'),
  'utf8',
);

describe('BUG-PHASE172-01 — payouts header has Withdraw CTA', () => {
  it('header has Withdraw button linking to /provider/withdraw', () => {
    expect(SOURCE).toMatch(
      /headerCta[\s\S]+?\/provider\/withdraw[\s\S]+?Withdraw/,
    );
  });

  it('PHASE172 fix-comment is preserved', () => {
    expect(SOURCE).toMatch(/BUG-PHASE172-01 fix/);
  });
});
