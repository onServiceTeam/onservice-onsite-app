const dbQueryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => dbQueryMock(...args), transaction: jest.fn() },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { getFeedbackForAdmin, getFeedbackHistoryForAdmin } from '../src/services/feedback-admin.service';

const FEEDBACK_ID = '11111111-1111-4111-8111-111111111111';

it('Bug UX-864 — ordinary-admin masking covers feedback summaries and current and historical decision notes', async () => {
  dbQueryMock.mockResolvedValueOnce({ rows: [{
    id: FEEDBACK_ID,
    created_at: '2026-09-01T00:00:00.000Z',
    updated_at: '2026-09-01T01:00:00.000Z',
    tester_name: 'Tester',
    tester_contact: null,
    role: 'customer',
    device: 'Desktop',
    areas: ['customer'],
    nps: 4,
    summary: 'Contact person@example.com about +63 917 123 4567.',
    item_count: 1,
    payload: {},
    status: 'triaged',
    assigned_admin_id: null,
    triage_note: 'Follow up with owner@example.com or +63 918 555 1234.',
    assigned_first_name: null,
    assigned_last_name: null,
  }] });
  dbQueryMock.mockResolvedValueOnce({ rows: [{ exists: true }] });
  dbQueryMock.mockResolvedValueOnce({ rows: [{
    id: 'audit-1',
    created_at: '2026-09-01T01:00:00.000Z',
    admin_first_name: 'Ana',
    admin_last_name: 'Reyes',
    admin_role: 'admin',
    previous_status: 'new',
    next_status: 'triaged',
    previous_owner_first_name: null,
    previous_owner_last_name: null,
    next_owner_first_name: 'Ana',
    next_owner_last_name: 'Reyes',
    note: 'Emailed owner@example.com and called +63 918 555 1234.',
  }] });

  const detail = await getFeedbackForAdmin(FEEDBACK_ID, 'admin');
  const history = await getFeedbackHistoryForAdmin(FEEDBACK_ID, 'admin');

  expect(detail.piiMasked).toBe(true);
  expect(detail.summary).toBe('Contact p•••@example.com about +63 9XX XXX 4567.');
  expect(detail.triageNote).toBe('Follow up with o•••@example.com or +63 9XX XXX 1234.');
  expect(history[0]?.note).toBe('Emailed o•••@example.com and called +63 9XX XXX 1234.');
});
