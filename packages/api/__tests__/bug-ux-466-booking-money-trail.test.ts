const dbQueryMock = jest.fn();
jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => dbQueryMock(...args), transaction: jest.fn() },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { getBookingMoney } from '../src/services/booking-admin.service';

it('Bug UX-466 — Booking 360 returns the gateway attempts, wallet ledger, and retained sales-record trail without client secrets', async () => {
  dbQueryMock
    .mockResolvedValueOnce({ rows: [{ id: 'booking-1' }], rowCount: 1 })
    .mockResolvedValueOnce({ rows: [{
      id: 'intent-1', paymongo_intent_id: 'pi_safe', paymongo_payment_id: 'pay_safe',
      amount: '125000', refunded_amount: '25000', payment_method: 'gcash', status: 'partially_refunded',
      created_at: new Date('2026-08-30T01:00:00.000Z'), updated_at: new Date('2026-08-30T02:00:00.000Z'),
    }], rowCount: 1 })
    .mockResolvedValueOnce({ rows: [{
      id: 'ledger-1', wallet_type: 'provider', wallet_user_id: 'provider-user-1', type: 'escrow_release',
      amount: '100000', balance_after: '140000', description: 'Booking release', reference_id: 'release-1',
      created_at: new Date('2026-08-30T03:00:00.000Z'),
    }], rowCount: 1 })
    .mockResolvedValueOnce({ rows: [{
      id: 'receipt-1', or_number: 'OR-2026-08-000001', gross_amount: '125000',
      provider_received: '100000', platform_retained: '25000', is_cancellation: false,
      cancelled_at: null, pdf_url: null, issued_at: new Date('2026-08-30T04:00:00.000Z'),
    }], rowCount: 1 });

  const money = await getBookingMoney('booking-1');

  expect(money.paymentIntents[0]).toMatchObject({ amount: 125000, refundedAmount: 25000, gatewayPaymentId: 'pay_safe' });
  expect(money.ledgerEntries[0]).toMatchObject({ walletType: 'provider', amount: 100000, balanceAfter: 140000 });
  expect(money.salesRecords[0]).toMatchObject({ number: 'OR-2026-08-000001', platformRetained: 25000 });
  expect(String(dbQueryMock.mock.calls[1]?.[0])).not.toContain('client_key');
});
