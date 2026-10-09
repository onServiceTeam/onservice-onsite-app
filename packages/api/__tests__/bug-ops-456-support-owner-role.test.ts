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

it('Bug OPS-456 - support creation rejects an internal staff account as the durable case owner', async () => {
  queryMock.mockResolvedValueOnce({ rows: [{ role: 'admin' }] });

  await expect(createTicket({
    userId: '45600000-abcd-4abc-8def-000000000456',
    type: 'account_issue',
    priority: 'medium',
    subject: 'Internal account mismatch',
    description: 'This request must belong to a customer or provider account.',
    createdByAdminId: '45600000-abcd-4abc-8def-000000000457',
  })).rejects.toMatchObject({
    statusCode: 404,
    message: 'Support ticket account not found.',
  });

  expect(queryMock).toHaveBeenCalledWith(
    expect.stringMatching(/role IN \('customer', 'provider', 'provider_staff'\)/),
    ['45600000-abcd-4abc-8def-000000000456'],
  );
  expect(transactionMock).not.toHaveBeenCalled();
});
