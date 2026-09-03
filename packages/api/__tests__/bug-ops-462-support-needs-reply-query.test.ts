jest.mock('../src/models/db', () => ({ db: { query: jest.fn() } }));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { db } from '../src/models/db';
import { listTickets } from '../src/services/support-ticket.service';

it('Bug OPS-462 - needs-reply filtering ignores internal activity and returns first public agent reply evidence', async () => {
  const queryMock = db.query as jest.Mock;
  queryMock
    .mockResolvedValueOnce({ rows: [{ count: '1' }] })
    .mockResolvedValueOnce({ rows: [{
      id: 'ticket-needs-reply',
      needs_agent_reply: true,
      first_agent_reply_at: null,
    }] });

  const result = await listTickets({ page: 1, limit: 20, needsReply: true });

  expect(result.tickets[0]).toMatchObject({ needs_agent_reply: true, first_agent_reply_at: null });
  const [countSql] = queryMock.mock.calls[0] as [string, unknown[]];
  const [listSql] = queryMock.mock.calls[1] as [string, unknown[]];
  for (const sql of [countSql, listSql]) {
    expect(sql).toMatch(/status NOT IN \('resolved', 'closed'\)/);
    expect(sql).toMatch(/latest_public\.is_internal_note = FALSE/);
    expect(sql).toMatch(/latest_public\.sender_role IN \('customer', 'provider'\)/);
  }
  expect(listSql).toMatch(/MIN\(first_reply\.created_at\)/);
  expect(listSql).toMatch(/first_reply\.sender_role IN \('admin', 'super_admin', 'support_agent'\)/);
});
