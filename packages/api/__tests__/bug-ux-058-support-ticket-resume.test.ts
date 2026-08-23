const queryMock = jest.fn();
const transactionMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: {
    query: (...args: unknown[]) => queryMock(...args),
    transaction: (callback: (client: { query: typeof queryMock }) => unknown) =>
      transactionMock(callback),
  },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { addMessage } from '../src/services/support-ticket.service';

it('Bug UX-058 — resumes waiting cases on user reply and keeps terminal cases read-only', async () => {
  transactionMock.mockImplementation(async (callback) => callback({ query: queryMock }));
  queryMock
    .mockResolvedValueOnce({ rows: [{ status: 'waiting_on_customer', assigned_agent_id: 'agent-1' }] })
    .mockResolvedValueOnce({ rows: [{ id: 'message-1', message: 'Here are the details.' }] })
    .mockResolvedValueOnce({ rows: [] });

  await addMessage({
    ticketId: 'ticket-1',
    senderId: 'customer-1',
    senderRole: 'customer',
    message: '  Here are the details.  ',
  });

  expect(queryMock.mock.calls[0]?.[0]).toMatch(/FOR UPDATE/);
  expect(queryMock.mock.calls[1]?.[1]).toEqual([
    'ticket-1',
    'customer-1',
    'customer',
    'Here are the details.',
    false,
  ]);
  expect(queryMock.mock.calls[2]?.[0]).toMatch(/SET status = \$2, updated_at = NOW\(\)/);
  expect(queryMock.mock.calls[2]?.[1]).toEqual(['ticket-1', 'in_progress']);

  queryMock.mockReset();
  queryMock.mockResolvedValueOnce({ rows: [{ status: 'closed', assigned_agent_id: 'agent-1' }] });
  await expect(addMessage({
    ticketId: 'ticket-closed',
    senderId: 'customer-1',
    senderRole: 'customer',
    message: 'One more thing',
  })).rejects.toMatchObject({ statusCode: 409 });
  expect(queryMock).toHaveBeenCalledTimes(1);
});
