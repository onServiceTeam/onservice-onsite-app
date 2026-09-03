const queryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => queryMock(...args) },
}));

import { getPaymentOperationsSummary } from '../src/services/financial-admin.service';

it('Bug OPS-435 - exact payment evidence is selected only by the canonical payment-attempt ID', async () => {
  const paymentAttemptId = '43500000-0000-4000-8000-000000000435';
  queryMock.mockImplementation(async (sql: string) => {
    if (sql.includes('to_regclass')) return { rows: [{ exists: 'available' }], rowCount: 1 };
    if (sql.includes('FROM payment_intents') && sql.includes('COUNT(*)')) return {
      rows: [{ total: '1', awaiting: '0', processing: '0', succeeded: '1', failed: '0', refunded: '0', partially_refunded: '0' }], rowCount: 1,
    };
    if (sql.includes('FROM payment_intents pi')) return {
      rows: [{
        id: paymentAttemptId,
        booking_id: '43500000-0000-4000-8000-000000004350',
        topup_id: null,
        paymongo_intent_id: 'pi_ops_435',
        paymongo_payment_id: 'pay_ops_435',
        customer_id: '43500000-0000-4000-8000-000000043500',
        customer_name: 'Exact Payment Customer',
        amount: '125000', refunded_amount: '0', payment_method: 'gcash', status: 'succeeded',
        created_at: new Date('2026-09-03T12:00:00.000Z'), updated_at: new Date('2026-09-03T12:01:00.000Z'),
      }], rowCount: 1,
    };
    if (sql.includes('FROM gateway_retry_queue') && sql.includes('COUNT(*)')) {
      return { rows: [{ pending: '0', in_progress: '0', failed_permanent: '0' }], rowCount: 1 };
    }
    if (sql.includes('FROM gateway_retry_queue')) return { rows: [], rowCount: 0 };
    throw new Error(`Unexpected query: ${sql}`);
  });

  const result = await getPaymentOperationsSummary({
    paymentAttemptId,
    intentSearch: '43500000-0000-4000-8000-000000043500',
  });
  const intentQuery = queryMock.mock.calls.find(([sql]) => String(sql).includes('FROM payment_intents pi'));

  expect(intentQuery?.[0]).toContain('WHERE pi.id = $1::uuid');
  expect(intentQuery?.[0]).not.toContain('OR LOWER(b.customer_id::text)');
  expect(intentQuery?.[1]).toEqual([paymentAttemptId]);
  expect(result.recentIntents).toEqual([
    expect.objectContaining({ id: paymentAttemptId, customerName: 'Exact Payment Customer' }),
  ]);
});
