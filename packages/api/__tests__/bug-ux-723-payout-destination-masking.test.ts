import { formatPayout } from '../src/services/payout.service';

it('Bug UX-723 — ordinary admin payout views mask the destination account and account holder', () => {
  const payout = {
    id: 'payout-1', provider_id: 'provider-1', wallet_id: 'wallet-1', amount: '100000',
    method: 'gcash', destination_account: '09171234567', account_name: 'Maria Santos', status: 'pending',
    paymongo_transfer_id: null, failure_reason: null, rejection_reason: null, notes: null,
    reviewed_by: null, reviewed_at: null, created_at: new Date('2026-08-31T00:00:00.000Z'), completed_at: null,
  } as never;

  expect(formatPayout(payout, { maskSensitive: true })).toMatchObject({
    destinationAccount: '+63 9XX XXX 4567',
    accountName: null,
  });
  expect(formatPayout(payout)).toMatchObject({
    destinationAccount: '09171234567',
    accountName: 'Maria Santos',
  });
});
