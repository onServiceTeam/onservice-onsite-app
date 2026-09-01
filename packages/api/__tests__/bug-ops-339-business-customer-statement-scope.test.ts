const queryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => queryMock(...args), transaction: jest.fn() },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { getInvoiceDetail } from '../src/services/invoice.service';

it('Bug OPS-339 — customer statement detail requires the exact account route and never exposes an internal draft', async () => {
  const accountId = '00000000-0000-4000-8000-000000000339';
  const invoiceId = '00000000-0000-4000-8000-000000000340';
  const calls: Array<{ sql: string; params: unknown[] }> = [];

  queryMock.mockImplementation(async (sqlValue: unknown, params: unknown[] = []) => {
    const sql = String(sqlValue);
    calls.push({ sql, params });
    if (sql.includes('FROM business_invoices')) {
      return { rows: [{
        id: invoiceId,
        business_account_id: accountId,
        status: 'sent',
      }], rowCount: 1 };
    }
    if (sql.includes('FROM business_members')) {
      return { rows: [{ can_view_invoices: true, role: 'member' }], rowCount: 1 };
    }
    if (sql.includes('FROM business_invoice_items')) return { rows: [], rowCount: 0 };
    throw new Error(`Unexpected SQL: ${sql}`);
  });

  await getInvoiceDetail(accountId, invoiceId, 'customer-1');

  const invoiceQuery = calls[0]!;
  expect(invoiceQuery.params).toEqual([invoiceId, accountId]);
  expect(invoiceQuery.sql).toContain('business_account_id = $2');
  expect(invoiceQuery.sql).toContain("status <> 'draft'");
});
