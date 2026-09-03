const queryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => queryMock(...args) },
}));

import { getPaymentOperationsSummary } from '../src/services/financial-admin.service';

it('Bug OPS-400 - payment operations retrieve an unresolved retry by its exact local identifier', async () => {
  queryMock.mockImplementation(async (sql: string, params?: unknown[]) => {
    if (sql.includes('to_regclass')) return { rows: [{ exists: String(params?.[0]) }], rowCount: 1 };
    if (sql.includes('FROM payment_intents') && sql.includes('COUNT(*)')) return {
      rows: [{ total: '0', awaiting: '0', processing: '0', succeeded: '0', failed: '0', refunded: '0', partially_refunded: '0' }],
      rowCount: 1,
    };
    if (sql.includes('FROM payment_intents pi')) return { rows: [], rowCount: 0 };
    if (sql.includes('FROM gateway_retry_queue') && sql.includes('COUNT(*)')) return {
      rows: [{ pending: '0', in_progress: '0', failed_permanent: '1' }], rowCount: 1,
    };
    if (sql.includes('FROM gateway_retry_queue')) return {
      rows: [{
        id: '40000000-0000-4000-8000-000000000400',
        booking_id: '40000000-0000-4000-8000-000000004000',
        dispute_id: null,
        action_type: 'refund_from_escrow',
        amount_centavos: '42000',
        status: 'failed_permanent',
        attempts: 5,
        max_attempts: 5,
        next_retry_at: new Date('2026-09-03T06:00:00.000Z'),
        last_attempted_at: new Date('2026-09-03T05:30:00.000Z'),
        last_error: 'gateway unavailable',
      }],
      rowCount: 1,
    };
    throw new Error(`Unexpected query: ${sql}`);
  });

  const result = await getPaymentOperationsSummary({
    retrySearch: '40000000-0000-4000-8000-000000000400',
  });
  const retryQuery = queryMock.mock.calls.find(([sql]) => (
    String(sql).includes('FROM gateway_retry_queue') && !String(sql).includes('COUNT(*)')
  ));

  expect(retryQuery?.[0]).toMatch(/LOWER\(id::text\) = LOWER\(\$3\)/);
  expect(retryQuery?.[1]).toEqual([25, 0, '40000000-0000-4000-8000-000000000400']);
  expect(result.gatewayRetries[0]).toMatchObject({
    id: '40000000-0000-4000-8000-000000000400',
    status: 'failed_permanent',
  });
});
