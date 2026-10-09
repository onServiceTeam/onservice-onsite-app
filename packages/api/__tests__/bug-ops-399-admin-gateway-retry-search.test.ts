jest.mock('../src/models/db', () => ({ db: { query: jest.fn() } }));

import { db } from '../src/models/db';
import { searchAdminRecords } from '../src/services/admin-search.service';

const queryMock = db.query as jest.Mock;

it('Bug OPS-399 - global operator search opens an unresolved gateway retry without exposing failure detail', async () => {
  queryMock.mockImplementation(async (sql: string) => ({
    rows: sql.includes('FROM gateway_retry_queue grq') ? [{
      id: '39900000-0000-4000-8000-000000000399',
      title: '39900000-0000-4000-8000-000000000399',
      context: 'Refund From Escrow · Booking 39900000 · Dispute 49900000',
      status: 'failed_permanent',
      phone: null,
      email: null,
      related_id: '39900000-0000-4000-8000-000000003990',
      rank: 0,
      created_at: new Date('2026-09-03T05:00:00.000Z'),
    }] : [],
  }));

  const results = await searchAdminRecords('39900000-0000-4000-8000-000000000399');

  expect(results).toEqual([{
    kind: 'gateway_retry',
    id: '39900000-0000-4000-8000-000000000399',
    title: 'Gateway retry 39900000',
    subtitle: 'Refund From Escrow · Booking 39900000 · Dispute 49900000 · failed permanent',
    status: 'failed permanent',
    to: '/financials?tab=payments&retrySearch=39900000-0000-4000-8000-000000000399',
  }]);
  expect(queryMock).toHaveBeenCalledTimes(12);
  const retryQuery = queryMock.mock.calls.find(([sql]) => (
    typeof sql === 'string' && sql.includes('FROM gateway_retry_queue grq')
  ));
  expect(retryQuery?.[0]).toMatch(/grq\.status IN \('pending', 'in_progress', 'failed_permanent'\)/);
  expect(retryQuery?.[0]).not.toMatch(/last_error/);
  expect(retryQuery?.[1]).toEqual([
    '39900000-0000-4000-8000-000000000399',
    '39900000000040008000000000000399',
    4,
  ]);
});
