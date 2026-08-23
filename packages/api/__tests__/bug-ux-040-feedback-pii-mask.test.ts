const dbQueryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: {
    query: (...args: unknown[]) => dbQueryMock(...args),
    transaction: jest.fn(),
  },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { getFeedbackForAdmin } from '../src/services/feedback-admin.service';

it('Bug UX-040 — masks tester contact and personal data inside feedback free text for ordinary admins', async () => {
  dbQueryMock.mockResolvedValueOnce({
    rows: [{
      id: '11111111-1111-1111-1111-111111111111',
      created_at: '2026-08-24T00:00:00.000Z',
      updated_at: '2026-08-24T00:00:00.000Z',
      tester_name: 'Test Person',
      tester_contact: 'test.person@example.com',
      role: 'customer',
      device: 'Desktop browser',
      areas: ['customer'],
      nps: 4,
      summary: 'Checkout failed',
      item_count: 1,
      payload: {
        answers: {
          detail: 'Email test.person@example.com or call +63 917 123 4567.',
        },
      },
      status: 'new',
      assigned_admin_id: null,
      triage_note: null,
      assigned_first_name: null,
      assigned_last_name: null,
    }],
  });

  const feedback = await getFeedbackForAdmin('11111111-1111-1111-1111-111111111111', 'admin');

  expect(feedback.testerContact).toBe('t•••@example.com');
  expect(feedback.contactMasked).toBe(true);
  expect(feedback.payload).toEqual({
    answers: { detail: 'Email t•••@example.com or call +63 9XX XXX 4567.' },
  });
});
