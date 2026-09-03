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

it('Bug OPS-459 - provider no-show classification rejects a provider-owned support case', async () => {
  queryMock.mockResolvedValueOnce({ rows: [{ role: 'provider' }] });

  await expect(createTicket({
    userId: '45900000-abcd-4abc-8def-000000000459',
    bookingId: '45900000-abcd-4abc-8def-000000000460',
    type: 'provider_no_show',
    priority: 'medium',
    subject: 'Customer was not present',
    description: 'The provider needs support with an on-site customer no-show.',
  })).rejects.toMatchObject({
    statusCode: 400,
    message: 'Provider no-show cases must belong to a customer account.',
  });

  expect(transactionMock).not.toHaveBeenCalled();
});
