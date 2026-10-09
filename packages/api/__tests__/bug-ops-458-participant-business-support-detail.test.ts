const queryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => queryMock(...args), transaction: jest.fn() },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { getTicketById } from '../src/services/support-ticket.service';

it('Bug OPS-458 - the Support detail read preserves booking-inherited Business Account context', async () => {
  const businessId = '45800000-abcd-4abc-8def-000000000458';
  queryMock.mockResolvedValueOnce({ rows: [{
    id: 'ticket-458', user_id: 'provider-458', booking_id: 'booking-458',
    business_account_id: null, related_business_account_id: businessId,
    business_account_name: 'Cebu Build Co', business_account_status: 'active',
  }] });

  const result = await getTicketById('ticket-458');

  expect(result).toMatchObject({
    business_account_id: null,
    related_business_account_id: businessId,
    business_account_name: 'Cebu Build Co',
    business_account_status: 'active',
  });
  const [sql, params] = queryMock.mock.calls[0] as [string, unknown[]];
  expect(sql).toMatch(/LEFT JOIN bookings booking_context ON booking_context\.id = st\.booking_id/);
  expect(sql).toMatch(/COALESCE\(st\.business_account_id, booking_context\.business_account_id\) AS related_business_account_id/);
  expect(params).toEqual(['ticket-458']);
});
