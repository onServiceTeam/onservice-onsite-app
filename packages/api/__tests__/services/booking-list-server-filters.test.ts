const dbQueryMock = jest.fn();

jest.mock('../../src/models/db', () => ({
  db: { query: (...args: unknown[]) => dbQueryMock(...args) },
}));
jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { listBookings } from '../../src/services/booking.service';

it('Bug UX-331 — provider job period and pay sorting apply before pagination in the server query', async () => {
  dbQueryMock
    .mockResolvedValueOnce({ rows: [{ count: '0' }] })
    .mockResolvedValueOnce({ rows: [] });

  await listBookings('provider-user', 'provider', {
    page: 1,
    pageSize: 15,
    status: 'completed',
    sort: 'highest_pay',
    periodDays: 30,
  });

  const countSql = dbQueryMock.mock.calls[0]![0] as string;
  const dataSql = dbQueryMock.mock.calls[1]![0] as string;
  expect(countSql).toContain("b.scheduled_at >= NOW() - ($6::int * INTERVAL '1 day')");
  expect(dataSql).toContain('ORDER BY b.service_price DESC, b.created_at DESC');
  expect(dbQueryMock.mock.calls[0]![1]).toEqual([
    'provider-user', 'confirmed', 'resolved', 'payout_ready', 'paid_out', 30,
  ]);
});
