const queryMock = jest.fn();
const transactionMock = jest.fn();
const transactionQueryMock = jest.fn();

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

it('Bug OPS-461 - customer provider no-show creation preserves the verified booking linkage', async () => {
  const userId = '46100000-abcd-4abc-8def-000000000461';
  const bookingId = '46100000-abcd-4abc-8def-000000000462';
  queryMock
    .mockResolvedValueOnce({ rows: [{ role: 'customer' }] })
    .mockResolvedValueOnce({ rows: [{ allowed: true, business_account_id: null }] })
    .mockResolvedValueOnce({ rows: [{ nextval: '1461' }] });
  transactionQueryMock.mockResolvedValueOnce({ rows: [{
    id: '46100000-abcd-4abc-8def-000000000463',
    ticket_number: 'TKT-1461',
    user_id: userId,
    type: 'provider_no_show',
    priority: 'high',
    booking_id: bookingId,
  }] });
  transactionMock.mockImplementationOnce(async (callback: (client: { query: typeof transactionQueryMock }) => unknown) =>
    callback({ query: transactionQueryMock }));

  const ticket = await createTicket({
    userId,
    bookingId,
    type: 'provider_no_show',
    priority: 'high',
    subject: 'Provider did not arrive',
    description: 'The customer needs support with a provider who did not arrive.',
  });

  expect(ticket).toMatchObject({ type: 'provider_no_show', booking_id: bookingId });
  expect(transactionQueryMock).toHaveBeenCalledWith(
    expect.stringMatching(/INSERT INTO support_tickets/),
    expect.arrayContaining([userId, 'provider_no_show', bookingId]),
  );
});
