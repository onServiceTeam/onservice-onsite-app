const dbQueryMock = jest.fn();
jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => dbQueryMock(...args), transaction: jest.fn() },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { listCustomers } from '../src/services/admin.service';

it('Bug UX-489 — customer queue counts active bookings, all booking-linked disputes, and open support cases from canonical records', async () => {
  dbQueryMock
    .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 })
    .mockResolvedValueOnce({ rows: [{ total_customers: '0', active_accounts: '0', inactive_accounts: '0', fraud_flagged: '0' }], rowCount: 1 })
    .mockResolvedValueOnce({ rows: [], rowCount: 0 });

  const result = await listCustomers({ page: 1, pageSize: 20 });
  const dataSql = String(dbQueryMock.mock.calls.find(([sql]) => String(sql).includes('open_support_tickets'))?.[0]);

  expect(dataSql).toContain('b.customer_id = u.id AND b.status IN');
  expect(dataSql).toContain('JOIN bookings b ON b.id = d.booking_id WHERE b.customer_id = u.id');
  expect(dataSql).toContain("d.status IN ('open', 'under_review', 'escalated')");
  expect(dataSql).toContain("st.user_id = u.id AND st.status NOT IN ('resolved', 'closed')");
  expect(result.summary).toEqual({ totalCustomers: 0, activeAccounts: 0, inactiveAccounts: 0, fraudFlagged: 0 });
});
