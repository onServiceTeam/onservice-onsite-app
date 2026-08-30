const dbQueryMock = jest.fn();
jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => dbQueryMock(...args), transaction: jest.fn() },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { listCustomers } from '../src/services/admin.service';

it('Bug UX-493 — customer queue accepts only defined sort modes and orders active-work views by canonical active bookings', async () => {
  dbQueryMock
    .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 })
    .mockResolvedValueOnce({ rows: [{ total_customers: '0', active_accounts: '0', inactive_accounts: '0', fraud_flagged: '0' }], rowCount: 1 })
    .mockResolvedValueOnce({ rows: [], rowCount: 0 });

  await listCustomers({ sort: 'active_work', page: 1, pageSize: 20 });
  const dataSql = String(dbQueryMock.mock.calls.find(([sql]) => String(sql).includes('open_support_tickets'))?.[0]);
  expect(dataSql).toMatch(/ORDER BY \(SELECT COUNT\(\*\) FROM bookings b WHERE b\.customer_id = u\.id AND b\.status IN \([^)]+\)\) DESC, u\.created_at DESC/);

  dbQueryMock.mockClear();
  await expect(listCustomers({ sort: 'unknown', page: 1, pageSize: 20 }))
    .rejects.toMatchObject({ statusCode: 400 });
  expect(dbQueryMock).not.toHaveBeenCalled();
});
