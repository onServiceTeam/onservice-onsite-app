const queryMock = jest.fn();
const transactionMock = jest.fn(async (callback: (client: { query: typeof queryMock }) => unknown) => (
  callback({ query: queryMock })
));

jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => queryMock(...args), transaction: (...args: unknown[]) => transactionMock(...args as [(client: { query: typeof queryMock }) => unknown]) },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { addMessage } from '../src/services/support-ticket.service';

it('Bug UX-698 — terminal support cases block public admin replies but preserve private post-closure notes', async () => {
  queryMock.mockResolvedValueOnce({ rows: [{ status: 'resolved', assigned_agent_id: 'agent-1' }] });
  await expect(addMessage({
    ticketId: 'ticket-1', senderId: 'admin-1', senderRole: 'admin', message: 'Public follow-up',
  })).rejects.toMatchObject({ statusCode: 409 });
  expect(queryMock).toHaveBeenCalledTimes(1);

  queryMock.mockReset();
  queryMock
    .mockResolvedValueOnce({ rows: [{ status: 'resolved', assigned_agent_id: 'agent-1' }] })
    .mockResolvedValueOnce({ rows: [{ id: 'message-1', message: 'Post-closure handoff note.' }] })
    .mockResolvedValueOnce({ rows: [] });
  const note = await addMessage({
    ticketId: 'ticket-1', senderId: 'admin-1', senderRole: 'admin',
    message: 'Post-closure handoff note.', isInternalNote: true,
  });

  expect(note.id).toBe('message-1');
  expect(queryMock.mock.calls[1]?.[1]).toEqual([
    'ticket-1', 'admin-1', 'admin', 'Post-closure handoff note.', true,
  ]);
  expect(queryMock.mock.calls[2]?.[0]).toMatch(/updated_at = NOW/);
});
