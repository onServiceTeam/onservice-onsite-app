// MED-N52 + MED-N54 + MED-N56 fix verified.
//
// MED-N52: requestAccountDeletion checked only available_balance.
// A provider with money held in escrow (pending_balance > 0)
// could request deletion and lose access to those funds when the
// cooling-off period ended (anonymized account can't withdraw).
// Now: separate check on pending_balance with a clear error
// message ("wait for in-flight bookings to complete first").
//
// MED-N54: cancelAccountDeletion only checked status, not whether
// cooling_off_ends_at had elapsed. Race: user cancels right
// before processExpiredCoolingOff cron flips the row to
// 'processing'. Now: WHERE clause also requires
// cooling_off_ends_at > NOW() so post-elapse cancellation is
// rejected.
//
// MED-N56: requestAccountDeletion only checked active bookings,
// not active disputes. Anonymizing during a live dispute
// resolved the dispute against an anonymized actor — admin
// couldn't contact, customer/provider couldn't follow up. Now:
// EXISTS check on disputes.status NOT IN ('resolved') with a
// clear "wait for the dispute to be resolved" error.

import { readFileSync } from 'fs';
import { resolve } from 'path';

const SVC = readFileSync(
  resolve(__dirname, '../src/services/data-management.service.ts'),
  'utf8',
);

describe('MED-N52 — pending_balance also blocks deletion', () => {
  it('SELECT pulls BOTH available + pending balance', () => {
    expect(SVC).toMatch(/MED-N52 fix[\s\S]{0,500}COALESCE\(SUM\(available_balance\), 0\)::text AS available[\s\S]{0,200}COALESCE\(SUM\(pending_balance\), 0\)::text AS pending/);
  });

  it('throws 409 with clear "held in escrow" message when pendBal > 0', () => {
    expect(SVC).toMatch(/Cannot delete account while you have funds held in escrow/);
    expect(SVC).toMatch(/wait for in-flight bookings to complete/);
  });

  it('still throws original "withdraw your wallet balance" when availBal > 0', () => {
    // Pre-fix message preserved for the available-balance branch.
    expect(SVC).toMatch(/Please withdraw your wallet balance before requesting account deletion/);
  });
});

describe('MED-N54 — cancelAccountDeletion guards against expired cooling-off', () => {
  it('UPDATE WHERE clause includes cooling_off_ends_at > NOW()', () => {
    expect(SVC).toMatch(/MED-N54 fix[\s\S]{0,400}cooling_off_ends_at > NOW\(\)/);
  });

  it('error message clarifies the elapsed-window case', () => {
    expect(SVC).toMatch(/cooling-off window has already elapsed/);
  });
});

describe('MED-N56 — active dispute also blocks deletion', () => {
  it('EXISTS-style check on disputes table', () => {
    expect(SVC).toMatch(/MED-N56 fix[\s\S]{0,500}FROM disputes d/);
  });

  it('considers any non-resolved dispute as blocking', () => {
    expect(SVC).toMatch(/d\.status NOT IN \('resolved'\)/);
  });

  it('joins through bookings to scope the dispute to either party', () => {
    expect(SVC).toMatch(/JOIN bookings b ON b\.id = d\.booking_id/);
    expect(SVC).toMatch(/b\.customer_id = \$1 OR b\.provider_id = \(SELECT id FROM providers WHERE user_id = \$1\)/);
  });

  it('error message tells user to wait for resolution', () => {
    expect(SVC).toMatch(/Cannot delete account while you have an unresolved dispute/);
  });
});
