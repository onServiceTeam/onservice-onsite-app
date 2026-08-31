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

import { updateTicketPriority } from '../src/services/support-ticket.service';

it('Bug UX-697 — a support priority change locks the case and atomically records the prior value and triage reason', async () => {
  queryMock
    .mockResolvedValueOnce({ rows: [{ priority: 'medium', status: 'in_progress' }] })
    .mockResolvedValueOnce({ rows: [{ id: 'ticket-1', priority: 'urgent', status: 'in_progress' }] })
    .mockResolvedValueOnce({ rows: [] });

  const result = await updateTicketPriority('ticket-1', 'urgent', {
    adminId: 'admin-1',
    workflowNote: 'Customer safety risk confirmed by the case owner.',
  });

  expect(result.priority).toBe('urgent');
  expect(transactionMock).toHaveBeenCalledTimes(1);
  expect(queryMock.mock.calls[0]?.[0]).toMatch(/FOR UPDATE/);
  expect(queryMock.mock.calls[2]?.[0]).toMatch(/support_ticket_priority_updated/);
  expect(queryMock.mock.calls[2]?.[1]).toEqual([
    'admin-1',
    'ticket-1',
    JSON.stringify({ priority: 'medium' }),
    JSON.stringify({ priority: 'urgent', workflowNote: 'Customer safety risk confirmed by the case owner.' }),
  ]);
});
