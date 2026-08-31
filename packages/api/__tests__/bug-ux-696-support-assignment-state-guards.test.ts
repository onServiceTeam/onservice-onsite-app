const queryMock = jest.fn();
const transactionMock = jest.fn(async (callback: (client: { query: typeof queryMock }) => unknown) => (
  callback({ query: queryMock })
));

jest.mock('../src/models/db', () => ({
  db: { query: jest.fn(), transaction: (...args: unknown[]) => transactionMock(...args as [(client: { query: typeof queryMock }) => unknown]) },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { assignTicket } from '../src/services/support-ticket.service';

it('Bug UX-696 — assignment rejects duplicate ownership and terminal cases before updating or auditing', async () => {
  queryMock.mockResolvedValueOnce({ rows: [{ assigned_agent_id: 'agent-1', status: 'in_progress' }] });
  await expect(assignTicket('ticket-1', 'agent-1', 'admin-1')).rejects.toMatchObject({ statusCode: 409 });
  expect(queryMock).toHaveBeenCalledTimes(1);

  queryMock.mockReset();
  queryMock.mockResolvedValueOnce({ rows: [{ assigned_agent_id: 'agent-1', status: 'closed' }] });
  await expect(assignTicket('ticket-1', 'agent-2', 'admin-1')).rejects.toMatchObject({ statusCode: 409 });
  expect(queryMock).toHaveBeenCalledTimes(1);
  expect(queryMock.mock.calls[0]?.[0]).toMatch(/FOR UPDATE/);
});
