jest.mock('../src/models/db', () => ({ db: { query: jest.fn() } }));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { db } from '../src/models/db';
import { listTickets } from '../src/services/support-ticket.service';

it('Bug OPS-303 — the operator queue orders equal-priority cases by their latest activity', async () => {
  const queryMock = db.query as jest.Mock;
  queryMock
    .mockResolvedValueOnce({ rows: [{ count: '2' }] })
    .mockResolvedValueOnce({ rows: [{ id: 'recent-reply' }, { id: 'older-case' }] });

  await listTickets({ page: 1, limit: 20 });

  const [listSql] = queryMock.mock.calls[1] as [string, unknown[]];
  expect(listSql.replace(/\s+/g, ' ')).toContain(
    "CASE st.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 END, st.updated_at DESC, st.created_at DESC",
  );
});
