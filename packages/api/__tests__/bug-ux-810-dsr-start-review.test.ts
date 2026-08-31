const queryMock = jest.fn();
const transactionMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: {
    transaction: (callback: unknown) => transactionMock(callback),
  },
}));
jest.mock('../src/utils/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn() } }));
jest.mock('../src/services/notification.service', () => ({ createPushNotification: jest.fn() }));

import { startDsrReview } from '../src/services/compliance-admin.service';

it('Bug UX-810 — starting DSR review atomically claims the received case and writes audit evidence without contacting the subject', async () => {
  const dsrId = '00000000-0000-0000-0000-000000000001';
  const adminUserId = '00000000-0000-0000-0000-000000000002';
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
      handled_by: adminUserId,
      admin_notes: '[stamp] Review started: Identity and request scope checked.',
      rejection_reason: null,
      response_payload_url: null,
    }] })
    .mockResolvedValueOnce({ rows: [] });

  const result = await startDsrReview({
    dsrId,
    adminUserId,
    reviewNote: 'Identity and request scope checked.',
  });

  expect(result.status).toBe('in_progress');
  expect(result.handledBy).toBe(adminUserId);
  expect(queryMock.mock.calls[0][0]).toMatch(/FOR UPDATE/);
  expect(queryMock.mock.calls[1][0]).toMatch(/status = 'in_progress'/);
  expect(queryMock.mock.calls[1][1][0]).toBe(adminUserId);
  expect(queryMock.mock.calls[2][0]).toMatch(/'dsr_review_started'/);
});
