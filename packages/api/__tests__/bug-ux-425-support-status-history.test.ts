const dbQueryMock = jest.fn();

jest.mock('../src/models/db', () => ({ db: { query: (...args: unknown[]) => dbQueryMock(...args) } }));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { getTicketStatusHistory } from '../src/services/support-ticket.service';

it('Bug UX-425 — support status history returns the administrator, rationale, and preserved resolution', async () => {
  dbQueryMock.mockResolvedValueOnce({ rows: [{
    id: 'audit-1', created_at: '2026-08-25T02:00:00.000Z', admin_first_name: 'Ana', admin_last_name: 'Reyes',
    admin_role: 'admin', previous_status: 'in_progress', next_status: 'resolved',
    workflow_note: 'Customer confirmed the completed return visit.', resolution_notes: 'Work completed and customer confirmed.',
  }] });

  const result = await getTicketStatusHistory('ticket-1');

  expect(dbQueryMock.mock.calls[0]?.[0]).toMatch(/support_ticket_status_updated/);
  expect(result[0]).toMatchObject({
    id: 'audit-1', adminName: 'Ana Reyes', previousStatus: 'in_progress', nextStatus: 'resolved',
    workflowNote: 'Customer confirmed the completed return visit.', resolutionNotes: 'Work completed and customer confirmed.',
  });
});
