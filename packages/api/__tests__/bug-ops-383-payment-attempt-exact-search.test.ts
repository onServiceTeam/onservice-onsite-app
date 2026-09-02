const queryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => queryMock(...args) },
}));

import { getPaymentOperationsSummary } from '../src/services/financial-admin.service';

it('Bug OPS-383 — payment operations retrieve an older attempt by its exact gateway identifier', async () => {
  queryMock.mockImplementation(async (sql: string, params?: unknown[]) => {
    if (sql.includes('to_regclass')) return { rows: [{ exists: String(params?.[0]) }], rowCount: 1 };
    if (sql.includes('FROM payment_intents') && sql.includes('COUNT(*)')) return {
      rows: [{ total: '51', awaiting: '0', processing: '0', succeeded: '51', failed: '0', refunded: '0', partially_refunded: '0' }], rowCount: 1,
    };
    if (sql.includes('FROM payment_intents pi')) return {
      rows: [{
        id: '38300000-0000-4000-8000-000000000383',
        booking_id: '38300000-0000-4000-8000-000000003830',
        topup_id: null,
        paymongo_intent_id: 'pi_ops_383',
        paymongo_payment_id: 'pay_ops_383',
        customer_id: '38300000-0000-4000-8000-000000038300',
        customer_name: 'Older Payment',
        amount: '125000', refunded_amount: '0', payment_method: 'gcash', status: 'succeeded',
        created_at: new Date('2026-08-01T00:00:00.000Z'), updated_at: new Date('2026-08-01T00:01:00.000Z'),
      }], rowCount: 1,
    };
    if (sql.includes('FROM gateway_retry_queue') && sql.includes('COUNT(*)')) {
      return { rows: [{ pending: '0', in_progress: '0', failed_permanent: '0' }], rowCount: 1 };
    }
    if (sql.includes('FROM gateway_retry_queue')) return { rows: [], rowCount: 0 };
    throw new Error(`Unexpected query: ${sql}`);
  });

  const result = await getPaymentOperationsSummary({ intentSearch: 'pi_ops_383' });
  const intentQuery = queryMock.mock.calls.find(([sql]) => String(sql).includes('FROM payment_intents pi'));

  expect(intentQuery?.[0]).toMatch(/LOWER\(pi\.paymongo_intent_id\) = LOWER\(\$1\)/);
  expect(intentQuery?.[1]).toEqual(['pi_ops_383']);
  expect(result.recentIntents[0]).toMatchObject({
    id: '38300000-0000-4000-8000-000000000383',
    paymongoIntentId: 'pi_ops_383',
    paymongoPaymentId: 'pay_ops_383',
  });
});
