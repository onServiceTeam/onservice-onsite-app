const queryMock = jest.fn();
const transactionMock = jest.fn(
  async (callback: (client: { query: typeof queryMock }) => unknown) =>
    callback({ query: queryMock }),
);

jest.mock('../src/models/db', () => ({
  db: {
    query: jest.fn(),
    transaction: (...args: unknown[]) =>
      transactionMock(...(args as [(client: { query: typeof queryMock }) => unknown])),
  },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { assignTicket } from '../src/services/support-ticket.service';

it('Bug UX-007 — validates and audit-logs a named support-agent assignment atomically', async () => {
  queryMock
    .mockResolvedValueOnce({ rows: [{ id: 'agent-1' }] })
    .mockResolvedValueOnce({
      rows: [{ id: 'ticket-1', assigned_agent_id: 'agent-1', status: 'in_progress' }],
    })
    .mockResolvedValueOnce({ rows: [], rowCount: 1 });

  const result = await assignTicket('ticket-1', 'agent-1', 'admin-1');

  expect(result.assigned_agent_id).toBe('agent-1');
  expect(transactionMock).toHaveBeenCalledTimes(1);
  expect(queryMock.mock.calls[0]?.[0]).toMatch(/role IN \('admin', 'super_admin'\)/);
  expect(queryMock.mock.calls[2]?.[0]).toMatch(/INSERT INTO admin_actions/);
  expect(queryMock.mock.calls[2]?.[1]).toEqual([
    'admin-1',
    'ticket-1',
    JSON.stringify({ op: 'support_ticket_assigned', assignedAgentId: 'agent-1' }),
  ]);
});
