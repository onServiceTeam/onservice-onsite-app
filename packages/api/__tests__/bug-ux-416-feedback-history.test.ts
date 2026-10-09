const dbQueryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => dbQueryMock(...args), transaction: jest.fn() },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { getFeedbackHistoryForAdmin } from '../src/services/feedback-admin.service';

it('Bug UX-416 — feedback history returns each prior owner, state, administrator, and evidence note', async () => {
  dbQueryMock.mockResolvedValueOnce({ rows: [{ exists: true }] });
  dbQueryMock.mockResolvedValueOnce({ rows: [{
    id: 'audit-1', created_at: '2026-08-25T01:00:00.000Z', admin_first_name: 'Ana', admin_last_name: 'Reyes',
    admin_role: 'admin', previous_status: 'new', next_status: 'triaged', previous_owner_first_name: null,
    previous_owner_last_name: null, next_owner_first_name: 'Ana', next_owner_last_name: 'Reyes',
    note: 'Verified and assigned the provider checklist issue.',
  }] });

  const result = await getFeedbackHistoryForAdmin('feedback-1', 'super_admin');

  expect(dbQueryMock.mock.calls[1]?.[0]).toMatch(/feedback_submission_updated/);
  expect(dbQueryMock.mock.calls[1]?.[1]).toEqual(['feedback-1']);
  expect(result).toEqual([{
    id: 'audit-1', createdAt: '2026-08-25T01:00:00.000Z', adminName: 'Ana Reyes', adminRole: 'admin',
    previousStatus: 'new', nextStatus: 'triaged', previousOwnerName: null, nextOwnerName: 'Ana Reyes',
    note: 'Verified and assigned the provider checklist issue.',
  }]);
});
