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

it('Bug OPS-466 - a Support case cannot enter the escalation queue without an accountable owner', async () => {
  clientQueryMock.mockResolvedValueOnce({ rows: [{
    status: 'in_progress',
    assigned_agent_id: null,
    resolution_notes: null,
    user_role: 'customer',
  }] });

  await expect(updateTicketStatus('ticket-466', 'escalated', undefined, {
    adminId: 'admin-466',
    workflowNote: 'Route to Finance for a reviewed payment decision.',
  })).rejects.toMatchObject({
    statusCode: 409,
    message: 'Assign a case owner before escalating this support request.',
  });
  expect(clientQueryMock).toHaveBeenCalledTimes(1);
});
