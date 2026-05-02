// MED-N166 fix verified — wallet.routes.ts /withdraw now delegates
// to payoutService.requestPayout instead of running its own inline
// db.transaction with a duplicated wallet-debit + payouts INSERT.
//
// Pre-fix: the inline implementation:
//   - duplicated the money path (drift risk between two code paths)
//   - bypassed the AML threshold check (MED-N77)
//   - bypassed the per-method destination format validation (MED-N78)
//   - bypassed the pending-payout-already-exists guard
//   - used a different audit pattern than payout.service
//
// Post-fix: single source of truth in payoutService.requestPayout.
// Wallet endpoint becomes a thin facade that just forwards the
// request body to the service and formats the response.

import { readFileSync } from 'fs';
import { resolve } from 'path';

const ROUTES = readFileSync(
  resolve(__dirname, '../src/routes/wallet.routes.ts'),
  'utf8',
);

describe('MED-N166 — /withdraw delegates to payoutService.requestPayout', () => {
  it('imports payoutService', () => {
    expect(ROUTES).toMatch(/import \* as payoutService from '\.\.\/services\/payout\.service'/);
  });

  it('the /withdraw handler calls payoutService.requestPayout with the user id and request body', () => {
    const block = ROUTES.match(/router\.post\(\s*'\/withdraw',[\s\S]*?(?=router\.[a-z]+\(|export default|$)/);
    expect(block).not.toBeNull();
    expect(block![0]).toMatch(/payoutService\.requestPayout\(userId,/);
    // The amount/method/destinationAccount must be passed through.
    expect(block![0]).toMatch(/amount,/);
    expect(block![0]).toMatch(/method,/);
    expect(block![0]).toMatch(/destinationAccount,/);
  });

  it('the /withdraw handler no longer runs its own db.transaction', () => {
    const block = ROUTES.match(/router\.post\(\s*'\/withdraw',[\s\S]*?(?=router\.[a-z]+\(|export default|$)/);
    expect(block).not.toBeNull();
    expect(block![0]).not.toMatch(/db\.transaction/);
  });

  it('the /withdraw handler no longer hand-writes the wallets UPDATE', () => {
    const block = ROUTES.match(/router\.post\(\s*'\/withdraw',[\s\S]*?(?=router\.[a-z]+\(|export default|$)/);
    expect(block).not.toBeNull();
    expect(block![0]).not.toMatch(/UPDATE wallets/);
  });

  it('the /withdraw handler no longer hand-writes the payouts INSERT', () => {
    const block = ROUTES.match(/router\.post\(\s*'\/withdraw',[\s\S]*?(?=router\.[a-z]+\(|export default|$)/);
    expect(block).not.toBeNull();
    expect(block![0]).not.toMatch(/INSERT INTO payouts/);
  });

  it('the response uses payoutService.formatPayout (not the local one)', () => {
    const block = ROUTES.match(/router\.post\(\s*'\/withdraw',[\s\S]*?(?=router\.[a-z]+\(|export default|$)/);
    expect(block).not.toBeNull();
    expect(block![0]).toMatch(/payoutService\.formatPayout\(payout\)/);
  });

  it('still gates the route to providers only', () => {
    const block = ROUTES.match(/router\.post\(\s*'\/withdraw',[\s\S]*?(?=router\.[a-z]+\(|export default|$)/);
    expect(block![0]).toMatch(/req\.user!\.role !== 'provider'/);
    expect(block![0]).toMatch(/Only providers can withdraw funds/);
  });
});
