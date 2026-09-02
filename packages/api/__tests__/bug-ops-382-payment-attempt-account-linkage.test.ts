const queryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => queryMock(...args) },
}));

import { getPaymentOperationsSummary } from '../src/services/financial-admin.service';

it('Bug OPS-382 — payment operations expose the booking customer identity with each attempt', async () => {
  queryMock.mockImplementation(async (sql: string, params?: unknown[]) => {
    if (sql.includes('to_regclass')) return { rows: [{ exists: String(params?.[0]) }], rowCount: 1 };
    if (sql.includes('FROM payment_intents') && sql.includes('COUNT(*)')) return {
      rows: [{ total: '1', awaiting: '0', processing: '0', succeeded: '1', failed: '0', refunded: '0', partially_refunded: '0' }], rowCount: 1,
    };
    if (sql.includes('FROM payment_intents pi')) return {
      rows: [{
        id: '38200000-0000-4000-8000-000000000382',
        booking_id: '38200000-0000-4000-8000-000000003820',
        topup_id: null,
        customer_id: '38200000-0000-4000-8000-000000038200',
        customer_name: 'Maria Payment', amount: '125000', refunded_amount: '0',
        payment_method: 'wallet', status: 'succeeded',
        created_at: new Date('2026-09-03T00:00:00.000Z'),
        updated_at: new Date('2026-09-03T00:01:00.000Z'),
      }], rowCount: 1,
    };
    if (sql.includes('FROM gateway_retry_queue') && sql.includes('COUNT(*)')) {
      return { rows: [{ pending: '0', in_progress: '0', failed_permanent: '0' }], rowCount: 1 };
    }
    if (sql.includes('FROM gateway_retry_queue')) return { rows: [], rowCount: 0 };
    throw new Error(`Unexpected query: ${sql}`);
  });

  const result = await getPaymentOperationsSummary();
  expect(queryMock.mock.calls.find(([sql]) => String(sql).includes('FROM payment_intents pi'))?.[0]).toMatch(
    /b\.customer_id::text AS customer_id/,
  );
  expect(result.recentIntents[0]).toMatchObject({
    id: '38200000-0000-4000-8000-000000000382',
    customerId: '38200000-0000-4000-8000-000000038200',
    customerName: 'Maria Payment',
  });
});
