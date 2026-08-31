const queryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => queryMock(...args), transaction: jest.fn() },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { getTicketStatusHistory } from '../src/services/support-ticket.service';

it('Bug UX-699 — automatic participant-reply resumes are returned as explicit case decisions with the replying actor', async () => {
  queryMock.mockResolvedValueOnce({ rows: [{
    id: 'audit-1', created_at: '2026-08-31T02:00:00.000Z', action: 'support_ticket_status_resumed_by_reply',
    admin_first_name: 'Maria', admin_last_name: 'Santos', admin_role: 'customer',
    previous_status: 'waiting_on_customer', next_status: 'in_progress',
    previous_priority: null, next_priority: null,
    workflow_note: 'customer reply resumed the support case.', resolution_notes: null,
  }] });

  const [entry] = await getTicketStatusHistory('ticket-1');

  expect(entry).toMatchObject({
    adminName: 'Maria Santos', adminRole: 'customer', decisionSource: 'participant_reply',
    previousStatus: 'waiting_on_customer', nextStatus: 'in_progress',
  });
});
