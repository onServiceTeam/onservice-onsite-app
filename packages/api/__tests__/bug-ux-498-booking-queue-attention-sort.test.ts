const dbQueryMock = jest.fn();
jest.mock('../src/models/db', () => ({ db: { query: (...args: unknown[]) => dbQueryMock(...args), transaction: jest.fn() } }));
jest.mock('../src/utils/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } }));

import { listBookingsAdmin } from '../src/services/admin.service';

it('Bug UX-498 — support-attention sort prioritizes urgent and unassigned cases, disputes, assignment gaps, and past-scheduled work', async () => {
  dbQueryMock.mockResolvedValue({ rows: [], rowCount: 0 });
  await listBookingsAdmin({ sort: 'attention', page: 1, pageSize: 20 });
  const dataSql = String(dbQueryMock.mock.calls.find(([sql]) => String(sql).includes('SELECT b.id'))?.[0]);
  const orderSql = dataSql.slice(dataSql.indexOf('ORDER BY'));

  expect(orderSql.indexOf("st.priority = 'urgent'")).toBeLessThan(orderSql.indexOf('st.assigned_agent_id IS NULL'));
  expect(orderSql).toContain("d.status IN ('open', 'under_review', 'escalated')");
  expect(orderSql).toContain("b.provider_id IS NULL AND b.status = 'paid'");
  expect(orderSql).toContain('b.scheduled_at < NOW() AND b.status IN');
});
