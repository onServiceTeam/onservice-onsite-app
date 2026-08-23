const queryMock = jest.fn();
const transactionMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: {
    query: (...args: unknown[]) => queryMock(...args),
    transaction: (...args: unknown[]) => transactionMock(...args),
  },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { createTicket } from '../src/services/support-ticket.service';

it('Bug UX-056 — rejects a booking-linked support case when the booking is unrelated to the ticket owner', async () => {
  queryMock
    .mockResolvedValueOnce({ rows: [{ role: 'customer' }] })
    .mockResolvedValueOnce({ rows: [{ allowed: false }] });

  await expect(createTicket({
    userId: '11111111-1111-4111-8111-111111111111',
    bookingId: '22222222-2222-4222-8222-222222222222',
    type: 'booking_issue',
    priority: 'medium',
    subject: 'Help with booking',
    description: 'This booking belongs to another account.',
  })).rejects.toMatchObject({ statusCode: 404 });

  expect(queryMock.mock.calls[1]?.[0]).toMatch(/b\.customer_id = \$2[\s\S]*p\.user_id = \$2[\s\S]*ps\.user_id = \$2/);
  expect(transactionMock).not.toHaveBeenCalled();
});
