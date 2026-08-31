const queryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => queryMock(...args) },
}));

import * as financialAdminService from '../src/services/financial-admin.service';

it('Bug UX-722 — finance can see payment attempts and unresolved post-commit gateway retries together', async () => {
  queryMock.mockImplementation(async (sql: string, params?: unknown[]) => {
    if (sql.includes('to_regclass')) return { rows: [{ exists: String(params?.[0]) }], rowCount: 1 };
    if (sql.includes('FROM payment_intents') && sql.includes('COUNT(*)')) return {
      rows: [{ total: '8', awaiting: '2', processing: '1', succeeded: '2', failed: '1', refunded: '1', partially_refunded: '1' }], rowCount: 1,
    };
    if (sql.includes('FROM payment_intents pi')) return {
      rows: [{
        id: 'intent-1', booking_id: 'booking-1', topup_id: null, customer_name: 'Maria Santos',
        amount: '100000', refunded_amount: '25000', payment_method: 'gcash', status: 'partially_refunded',
        created_at: new Date('2026-08-30T01:00:00.000Z'), updated_at: new Date('2026-08-30T02:00:00.000Z'),
      }], rowCount: 1,
    };
    if (sql.includes('FROM gateway_retry_queue') && sql.includes('COUNT(*)')) return {
      rows: [{ pending: '1', in_progress: '0', failed_permanent: '1' }], rowCount: 1,
    };
    if (sql.includes('FROM gateway_retry_queue')) return {
      rows: [{
        id: 'retry-1', booking_id: 'booking-1', dispute_id: null, action_type: 'refund_from_escrow',
        amount_centavos: '25000', status: 'failed_permanent', attempts: 5, max_attempts: 5,
        next_retry_at: new Date('2026-08-30T03:00:00.000Z'), last_attempted_at: new Date('2026-08-30T02:30:00.000Z'),
        last_error: 'gateway unavailable',
      }], rowCount: 1,
    };
    throw new Error(`Unexpected query: ${sql}`);
  });

  const result = await financialAdminService.getPaymentOperationsSummary();

  expect(result).toMatchObject({
    paymentIntentsAvailable: true,
    gatewayRetriesAvailable: true,
    totalAttempts: 8,
    pendingGatewayRetries: 1,
    permanentGatewayFailures: 1,
  });
  expect(result.recentIntents[0]).toMatchObject({ bookingId: 'booking-1', refundedAmountCentavos: 25_000 });
  expect(result.gatewayRetries[0]).toMatchObject({ actionType: 'refund_from_escrow', status: 'failed_permanent' });
  const retryListCall = queryMock.mock.calls.find(([sql]) => (
    String(sql).includes('FROM gateway_retry_queue') && !String(sql).includes('COUNT(*)')
  ));
  expect(retryListCall?.[1]).toEqual([25, 0]);
});
