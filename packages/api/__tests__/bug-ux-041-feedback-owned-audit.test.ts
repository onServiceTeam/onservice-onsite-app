const dbQueryMock = jest.fn();
const clientQueryMock = jest.fn();
const transactionMock = jest.fn(
  async (callback: (client: { query: typeof clientQueryMock }) => unknown) =>
    callback({ query: clientQueryMock }),
);

jest.mock('../src/models/db', () => ({
  db: {
    query: (...args: unknown[]) => dbQueryMock(...args),
    transaction: (...args: unknown[]) => transactionMock(...args),
  },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { updateFeedbackTriage } from '../src/services/feedback-admin.service';

it('Bug UX-041 — assigns and audit-logs tester feedback triage in one transaction', async () => {
  clientQueryMock
    .mockResolvedValueOnce({ rows: [{ status: 'new', assigned_admin_id: null, triage_note: null }] })
    .mockResolvedValueOnce({ rows: [{ id: '22222222-2222-2222-2222-222222222222' }] })
    .mockResolvedValueOnce({ rows: [], rowCount: 1 })
    .mockResolvedValueOnce({ rows: [], rowCount: 1 });
  dbQueryMock.mockResolvedValueOnce({
    rows: [{
      id: '11111111-1111-1111-1111-111111111111',
      created_at: '2026-08-24T00:00:00.000Z',
      updated_at: '2026-08-24T01:00:00.000Z',
      tester_name: null,
      tester_contact: null,
      role: 'provider',
      device: 'Tablet browser',
      areas: ['provider'],
      nps: 5,
      summary: 'Checklist issue',
      item_count: 1,
      payload: {},
      status: 'triaged',
      assigned_admin_id: '22222222-2222-2222-2222-222222222222',
      triage_note: 'Verified and linked to provider checklist work.',
      assigned_first_name: 'Ana',
      assigned_last_name: 'Reyes',
    }],
  });

  const result = await updateFeedbackTriage({
    feedbackId: '11111111-1111-1111-1111-111111111111',
    adminId: '33333333-3333-3333-3333-333333333333',
    actorRole: 'admin',
    status: 'triaged',
    assignedAdminId: '22222222-2222-2222-2222-222222222222',
    note: 'Verified and linked to provider checklist work.',
  });

  expect(result.assignedAdminName).toBe('Ana Reyes');
  expect(transactionMock).toHaveBeenCalledTimes(1);
  expect(clientQueryMock.mock.calls[1]?.[0]).toMatch(/role IN \('admin', 'super_admin'\)/);
  expect(clientQueryMock.mock.calls[2]?.[0]).toMatch(/UPDATE feedback_submissions/);
  expect(clientQueryMock.mock.calls[3]?.[0]).toMatch(/INSERT INTO audit_log/);
  expect(clientQueryMock.mock.calls[3]?.[1]).toEqual([
    '33333333-3333-3333-3333-333333333333',
    '11111111-1111-1111-1111-111111111111',
    JSON.stringify({ status: 'new', assignedAdminId: null, triageNote: null }),
    JSON.stringify({
      status: 'triaged',
      assignedAdminId: '22222222-2222-2222-2222-222222222222',
      triageNote: 'Verified and linked to provider checklist work.',
    }),
  ]);
});
