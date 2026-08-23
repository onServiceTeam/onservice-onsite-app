jest.mock('../src/models/db', () => ({ db: { query: jest.fn() } }));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { db } from '../src/models/db';
import { listTickets } from '../src/services/support-ticket.service';

it('Bug UX-059 — filters the support queue by search, account, and booking while returning persona metadata', async () => {
  const queryMock = db.query as jest.Mock;
  queryMock
    .mockResolvedValueOnce({ rows: [{ count: '1' }] })
    .mockResolvedValueOnce({ rows: [{ id: 'ticket-1', user_role: 'provider', provider_id: 'provider-1' }] });

  const result = await listTickets({
    page: 1,
    limit: 20,
    search: 'Cebu Aircon',
    userId: '11111111-1111-4111-8111-111111111111',
    bookingId: '22222222-2222-4222-8222-222222222222',
  });

  const [dataSql, dataParams] = queryMock.mock.calls[1] as [string, unknown[]];
  expect(dataSql).toMatch(/u\.role AS user_role/);
  expect(dataSql).toMatch(/AS provider_id/);
  expect(dataSql).toMatch(/st\.booking_id = \$1[\s\S]*st\.user_id = \$2[\s\S]*ILIKE \$3/);
  expect(dataParams.slice(0, 3)).toEqual([
    '22222222-2222-4222-8222-222222222222',
    '11111111-1111-4111-8111-111111111111',
    '%Cebu Aircon%',
  ]);
  expect(result.tickets[0]).toMatchObject({ user_role: 'provider', provider_id: 'provider-1' });
});
