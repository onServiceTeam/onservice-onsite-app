const dbQueryMock = jest.fn();
jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => dbQueryMock(...args), transaction: jest.fn() },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { listCustomers } from '../src/services/admin.service';

it('Bug UX-488 — customer queue full-name search and account-state filters match real stored flags and reject invented states', async () => {
  dbQueryMock
    .mockResolvedValueOnce({ rows: [{ count: '1' }], rowCount: 1 })
    .mockResolvedValueOnce({ rows: [{ total_customers: '5', active_accounts: '4', inactive_accounts: '1', fraud_flagged: '2' }], rowCount: 1 })
    .mockResolvedValueOnce({ rows: [], rowCount: 0 });

  await listCustomers({ search: 'Ana Reyes', status: 'active', page: 1, pageSize: 20 });

  const dataCall = dbQueryMock.mock.calls.find(([sql]) => String(sql).includes('active_bookings'));
  expect(dataCall?.[0]).toContain("CONCAT_WS(' ', u.first_name, u.last_name)");
  expect(dataCall?.[0]).toContain('u.is_active = TRUE');
  expect(dataCall?.[0]).not.toContain('u.is_flagged_fraud = FALSE');
  expect(dataCall?.[1]).toEqual(['%Ana Reyes%', 20, 0]);

  dbQueryMock.mockClear();
  await expect(listCustomers({ status: 'suspended', page: 1, pageSize: 20 }))
    .rejects.toMatchObject({ statusCode: 400 });
  expect(dbQueryMock).not.toHaveBeenCalled();
});
