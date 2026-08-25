const clientQueryMock = jest.fn();
const transactionMock = jest.fn(
  async (callback: (client: { query: typeof clientQueryMock }) => unknown) => callback({ query: clientQueryMock }),
);

jest.mock('../src/models/db', () => ({
  db: { query: jest.fn(), transaction: (...args: unknown[]) => transactionMock(...args) },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { updateTicketStatus } from '../src/services/support-ticket.service';

it('Bug UX-420 — reopening a terminal support case atomically clears stale closure data and audits the reason', async () => {
  clientQueryMock
    .mockResolvedValueOnce({ rows: [{ status: 'closed', assigned_agent_id: 'agent-1', resolution_notes: 'Earlier outcome.' }] })
    .mockResolvedValueOnce({ rows: [{ id: 'ticket-1', status: 'open', assigned_agent_id: 'agent-1', resolution_notes: null }] })
    .mockResolvedValueOnce({ rows: [], rowCount: 1 });

  await updateTicketStatus('ticket-1', 'open', undefined, {
    adminId: 'admin-1',
    workflowNote: 'Customer replied and the issue remains unresolved.',
  });

  expect(transactionMock).toHaveBeenCalledTimes(1);
  expect(clientQueryMock.mock.calls[1]?.[0]).toMatch(/resolved_at = NULL[\s\S]*closed_at = NULL[\s\S]*resolution_notes = NULL/);
  expect(clientQueryMock.mock.calls[2]?.[0]).toMatch(/support_ticket_status_updated/);
  expect(JSON.parse(clientQueryMock.mock.calls[2]?.[1]?.[3] as string)).toMatchObject({
    status: 'open',
    workflowNote: 'Customer replied and the issue remains unresolved.',
    resolutionNotes: null,
  });
});
