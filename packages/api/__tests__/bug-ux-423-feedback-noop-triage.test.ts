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

import { updateFeedbackTriage } from '../src/services/feedback-admin.service';

it('Bug UX-423 — identical feedback triage cannot create a duplicate audit decision', async () => {
  clientQueryMock.mockResolvedValueOnce({ rows: [{
    status: 'triaged', assigned_admin_id: 'agent-1', triage_note: 'Already verified and assigned.',
    updated_at: '2026-08-24T00:00:00.000Z',
  }] });

  await expect(updateFeedbackTriage({
    feedbackId: 'feedback-1', adminId: 'admin-1', actorRole: 'admin', status: 'triaged',
    assignedAdminId: 'agent-1', note: 'Already verified and assigned.',
    expectedUpdatedAt: '2026-08-24T00:00:00.000Z',
  })).rejects.toMatchObject({ statusCode: 409 });
  expect(clientQueryMock).toHaveBeenCalledTimes(1);
});
