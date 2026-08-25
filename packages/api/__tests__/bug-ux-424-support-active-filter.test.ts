jest.mock('../src/models/db', () => ({ db: { query: jest.fn() } }));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { db } from '../src/models/db';
import { listTickets } from '../src/services/support-ticket.service';

it('Bug UX-424 — active urgent and unassigned support signals exclude resolved and closed cases from their lists', async () => {
  const queryMock = db.query as jest.Mock;
  queryMock
    .mockResolvedValueOnce({ rows: [{ count: '1' }] })
    .mockResolvedValueOnce({ rows: [{ id: 'ticket-1', status: 'open', priority: 'urgent' }] });

  await listTickets({ page: 1, limit: 20, priority: 'urgent', unassigned: true, active: true });

  const [countSql] = queryMock.mock.calls[0] as [string, unknown[]];
  const [listSql] = queryMock.mock.calls[1] as [string, unknown[]];
  expect(countSql).toMatch(/assigned_agent_id IS NULL[\s\S]*status NOT IN \('resolved', 'closed'\)/);
  expect(listSql).toMatch(/assigned_agent_id IS NULL[\s\S]*status NOT IN \('resolved', 'closed'\)/);
});
