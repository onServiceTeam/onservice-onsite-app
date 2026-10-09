const queryMock = jest.fn();
const transactionMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: {
    query: (...args: unknown[]) => queryMock(...args),
    transaction: (...args: unknown[]) => transactionMock(...args),
  },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { recordInvoiceAdjustment } from '../src/services/business-invoice-control.service';

it('Bug OPS-337 — a post-payment rate reduction records a customer credit-due settlement state instead of falsely claiming cash settlement', async () => {
  const invoiceId = '00000000-0000-4000-8000-000000000337';
  const accountId = '00000000-0000-4000-8000-000000000338';
  let balanceReads = 0;
  let updateSql = '';

  queryMock.mockImplementation(async (sqlValue: unknown) => {
    const sql = String(sqlValue);
    if (sql.includes('SELECT business_account_id FROM business_invoices')) {
      return { rows: [{ business_account_id: accountId }], rowCount: 1 };
    }
    if (sql.includes('pg_advisory_xact_lock')) return { rows: [{}], rowCount: 1 };
    if (sql.includes('SELECT * FROM business_invoices') && sql.includes('FOR UPDATE')) {
      return { rows: [{
        id: invoiceId, business_account_id: accountId, status: 'sent',
        control_state: 'controlled', settlement_state: 'open', record_version: 5,
        total_amount: 100_000, currency: 'PHP',
        finalized_at: new Date('2026-09-01T00:00:00.000Z'),
      }], rowCount: 1 };
    }
    if (sql.includes('AS balance_due')) {
      balanceReads += 1;
      return { rows: [balanceReads === 1
        ? { adjustment_total: 0, payment_total: 80_000, adjusted_total: 100_000, balance_due: 20_000 }
        : { adjustment_total: -30_000, payment_total: 80_000, adjusted_total: 70_000, balance_due: -10_000 }], rowCount: 1 };
    }
    if (sql.includes('INSERT INTO business_invoice_adjustments')) {
      return { rows: [{ id: 'adjustment-337' }], rowCount: 1 };
    }
    if (sql.includes('UPDATE business_invoices')) {
      updateSql = sql;
      return { rows: [{
        id: invoiceId, business_account_id: accountId, status: 'paid',
        control_state: 'controlled', settlement_state: 'credit_due', record_version: 6,
        total_amount: 100_000, currency: 'PHP',
      }], rowCount: 1 };
    }
    if (sql.includes('INSERT INTO admin_actions')) return { rows: [], rowCount: 1 };
    throw new Error(`Unexpected SQL: ${sql}`);
  });
  transactionMock.mockImplementation(async (callback: (client: unknown) => unknown) => callback({ query: queryMock }));

  const result = await recordInvoiceAdjustment(invoiceId, {
    expectedVersion: 5,
    adjustmentType: 'credit',
    amount: 30_000,
    currency: 'PHP',
    evidenceReference: 'SUPPORT-CASE-337',
    reason: 'Approve a post-service rate reduction after the quality review.',
  }, '00000000-0000-4000-8000-000000000001');

  expect(result.invoice.settlement_state).toBe('credit_due');
  expect(result.balance.balance_due).toBe(-10_000);
  expect(updateSql).toContain("WHEN $3::bigint < 0 THEN 'credit_due'");
});
