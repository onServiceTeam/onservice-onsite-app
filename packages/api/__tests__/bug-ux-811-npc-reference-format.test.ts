const queryMock = jest.fn();
const transactionMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { transaction: (callback: unknown) => transactionMock(callback) },
}));
jest.mock('../src/utils/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn() } }));
jest.mock('../src/services/notification.service', () => ({ createPushNotification: jest.fn() }));

import { escalateDsrToNpc } from '../src/services/compliance-admin.service';

it('Bug UX-811 — a DPO can preserve an issued NPC case reference that does not fit the invented app mask', async () => {
  const dsrId = '00000000-0000-0000-0000-000000000001';
  transactionMock.mockImplementation(async (callback: (client: { query: typeof queryMock }) => unknown) => callback({ query: queryMock }));
  queryMock
    .mockResolvedValueOnce({ rows: [{ id: dsrId, user_id: 'subject-1', status: 'received', admin_notes: null, completed_at: null }] })
    .mockResolvedValueOnce({ rows: [{
      id: dsrId,
      user_id: 'subject-1',
      request_type: 'access',
      status: 'in_progress',
      received_at: new Date('2026-08-31T00:00:00Z'),
      due_at: new Date('2026-09-15T00:00:00Z'),
      completed_at: null,
      handled_by: 'admin-1',
      admin_notes: '[stamp] Escalated to NPC: NPC Case No. 19-258',
      rejection_reason: null,
      response_payload_url: null,
    }] })
    .mockResolvedValueOnce({ rows: [] });

  const result = await escalateDsrToNpc({
    dsrId,
    adminUserId: 'admin-1',
    npcReference: 'NPC Case No. 19-258',
  });

  expect(result.status).toBe('in_progress');
  expect(queryMock.mock.calls[1][1][0]).toMatch(/NPC Case No\. 19-258/);
  expect(queryMock.mock.calls[2][1][2]).toContain('NPC Case No. 19-258');
});
