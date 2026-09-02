const queryMock = jest.fn();
const clientQueryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: {
    query: (...args: unknown[]) => queryMock(...args),
    transaction: (callback: (client: { query: typeof clientQueryMock }) => unknown) => (
      callback({ query: clientQueryMock })
    ),
  },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { createTicket } from '../src/services/support-ticket.service';

it('Bug OPS-391 - an account-wide support case requires a real company owner or active member', async () => {
  const businessId = '11111111-1111-4111-8111-111111111111';
  const ownerId = '22222222-2222-4222-8222-222222222222';
  queryMock
    .mockResolvedValueOnce({ rows: [{ role: 'customer' }] })
    .mockResolvedValueOnce({ rows: [{ allowed: true }] })
    .mockResolvedValueOnce({ rows: [{ nextval: '1042' }] });
  clientQueryMock
    .mockResolvedValueOnce({ rows: [{
      id: '33333333-3333-4333-8333-333333333333',
      ticket_number: 'TKT-1042',
      user_id: ownerId,
      business_account_id: businessId,
    }] })
    .mockResolvedValueOnce({ rows: [] });

  const ticket = await createTicket({
    userId: ownerId,
    type: 'account_issue',
    priority: 'high',
    subject: 'Company account access',
    description: 'The company owner cannot open the consolidated work history.',
    businessAccountId: businessId,
    createdByAdminId: '44444444-4444-4444-8444-444444444444',
  });

  expect(ticket.business_account_id).toBe(businessId);
  expect(queryMock.mock.calls[1]?.[0]).toMatch(/business_members bm/);
  expect(queryMock.mock.calls[1]?.[0]).toMatch(/bm\.deleted_at IS NULL/);
  expect(queryMock.mock.calls[1]?.[1]).toEqual([businessId, ownerId]);
  expect(clientQueryMock.mock.calls[0]?.[0]).toMatch(/business_account_id/);
  expect(clientQueryMock.mock.calls[0]?.[1]?.at(-1)).toBe(businessId);
  expect(clientQueryMock.mock.calls[1]?.[1]?.[2]).toContain(`"businessAccountId":"${businessId}"`);
});
