const queryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => queryMock(...args), transaction: jest.fn() },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { listTickets } from '../src/services/support-ticket.service';

it('Bug OPS-392 - company support view includes direct cases and cases inherited from company bookings', async () => {
  const businessId = '11111111-1111-4111-8111-111111111111';
  queryMock
    .mockResolvedValueOnce({ rows: [{ count: '2' }] })
    .mockResolvedValueOnce({ rows: [{
      id: 'ticket-1',
      business_account_id: null,
      related_business_account_id: businessId,
      business_account_name: 'Cebu Build Co',
    }] });

  const result = await listTickets({ page: 1, limit: 25, businessAccountId: businessId });

  expect(result.total).toBe(2);
  expect(result.tickets[0]).toMatchObject({
    related_business_account_id: businessId,
    business_account_name: 'Cebu Build Co',
  });
  expect(queryMock.mock.calls[0]?.[0]).toMatch(/st\.business_account_id = \$1/);
  expect(queryMock.mock.calls[0]?.[0]).toMatch(/booking_context\.business_account_id = \$1/);
  expect(queryMock.mock.calls[1]?.[0]).toMatch(/COALESCE\(st\.business_account_id, booking_context\.business_account_id\)/);
  expect(queryMock.mock.calls[0]?.[1]).toEqual([businessId]);
  expect(queryMock.mock.calls[1]?.[1]).toEqual([businessId, 25, 0]);
});
