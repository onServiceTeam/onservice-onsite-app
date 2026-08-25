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

it('Bug UX-427 — a private support case cannot wait on a participant who does not own that case', async () => {
  clientQueryMock.mockResolvedValueOnce({ rows: [{
    status: 'in_progress', assigned_agent_id: 'agent-1', resolution_notes: null, user_role: 'customer',
  }] });

  await expect(updateTicketStatus('ticket-1', 'waiting_on_provider', undefined, {
    adminId: 'admin-1', workflowNote: 'Waiting for provider details before continuing.',
  })).rejects.toMatchObject({ statusCode: 400 });
  expect(clientQueryMock).toHaveBeenCalledTimes(1);
});
