const queryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => queryMock(...args), transaction: jest.fn() },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { listMyTickets } from '../src/services/support-ticket.service';

it('Bug OPS-457 - the owner-scoped Support list preserves canonical Business Account context', async () => {
  const businessId = '45700000-abcd-4abc-8def-000000000457';
  queryMock
    .mockResolvedValueOnce({ rows: [{ count: '1' }] })
    .mockResolvedValueOnce({ rows: [{
      id: 'ticket-457', user_id: 'customer-457',
      related_business_account_id: businessId,
      business_account_name: 'Cebu Build Co',
      business_account_status: 'active',
    }] });

  const result = await listMyTickets({ userId: 'customer-457', page: 1, limit: 20 });

  expect(result.tickets[0]).toMatchObject({
    related_business_account_id: businessId,
    business_account_name: 'Cebu Build Co',
    business_account_status: 'active',
  });
  const [sql, params] = queryMock.mock.calls[1] as [string, unknown[]];
  expect(sql).toMatch(/COALESCE\(st\.business_account_id, booking_context\.business_account_id\) AS related_business_account_id/);
  expect(sql).toMatch(/business_context\.company_name AS business_account_name/);
  expect(params[0]).toBe('customer-457');
});
