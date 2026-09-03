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

it('Bug OPS-460 - customer provider no-show classification requires the affected booking', async () => {
  queryMock.mockResolvedValueOnce({ rows: [{ role: 'customer' }] });

  await expect(createTicket({
    userId: '46000000-abcd-4abc-8def-000000000460',
    type: 'provider_no_show',
    priority: 'high',
    subject: 'Provider did not arrive',
    description: 'The customer needs support with a provider who did not arrive.',
  })).rejects.toMatchObject({
    statusCode: 400,
    message: 'Provider no-show cases must be linked to the affected booking.',
  });

  expect(transactionMock).not.toHaveBeenCalled();
});
