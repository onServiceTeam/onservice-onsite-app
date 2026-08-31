const queryMock = jest.fn();

jest.mock('../src/models/db', () => ({ db: { query: (...args: unknown[]) => queryMock(...args) } }));

import { listTickets } from '../src/services/support-ticket.service';

it('Bug UX-759 — support history can include account-owned, staff-owned, and booking-linked cases for either 360 workspace', async () => {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  queryMock.mockImplementation(async (sql: string, params: unknown[] = []) => {
    calls.push({ sql, params });
    return /COUNT\(\*\)/.test(sql)
      ? { rows: [{ count: '0' }], rowCount: 1 }
      : { rows: [], rowCount: 0 };
  });
  const customerId = '0198f711-c7c8-7a42-8c86-43f49d91f2d0';
  const providerId = '0198f711-c7c8-7a42-8c86-43f49d91f2d1';

  await listTickets({ page: 1, limit: 20, relatedCustomerId: customerId });
  await listTickets({ page: 1, limit: 20, relatedProviderId: providerId });

  const customerSql = calls[0]?.sql ?? '';
  expect(customerSql).toMatch(/st\.user_id = \$1/);
  expect(customerSql).toMatch(/linked_customer_booking\.customer_id = \$1/);
  expect(calls[0]?.params).toEqual([customerId]);
  const providerSql = calls[2]?.sql ?? '';
  expect(providerSql).toMatch(/linked_direct_provider\.user_id = st\.user_id/);
  expect(providerSql).toMatch(/linked_provider_staff\.user_id = st\.user_id/);
  expect(providerSql).toMatch(/linked_provider_booking\.provider_id = \$1/);
  expect(calls[2]?.params).toEqual([providerId]);
});
