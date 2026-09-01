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

import { recordInvoicePayment } from '../src/services/business-invoice-control.service';

it('Bug OPS-329 — partial external payment records immutable evidence and does not falsely mark the statement paid', async () => {
  const invoiceId = '00000000-0000-4000-8000-000000000329';
  const accountId = '00000000-0000-4000-8000-000000000330';
  let balanceReads = 0;
  const calls: string[] = [];
  queryMock.mockImplementation(async (sqlValue: unknown) => {
    const sql = String(sqlValue);
    calls.push(sql);
    if (sql.includes('SELECT business_account_id FROM business_invoices')) {
      return { rows: [{ business_account_id: accountId }], rowCount: 1 };
    }
    if (sql.includes('SELECT * FROM business_invoices') && sql.includes('FOR UPDATE')) {
      return { rows: [{
        id: invoiceId, business_account_id: accountId, status: 'sent',
        control_state: 'controlled', record_version: 3, total_amount: 100_000, currency: 'PHP',
        finalized_at: new Date('2026-09-01T03:00:00.000Z'),
      }], rowCount: 1 };
    }
    if (sql.includes('SELECT NOW() AS now')) {
      return { rows: [{ now: new Date('2026-09-02T00:00:00.000Z') }], rowCount: 1 };
    }
    if (sql.includes('pg_advisory_xact_lock')) return { rows: [{}], rowCount: 1 };
    if (sql.includes('AS balance_due')) {
      balanceReads += 1;
      return { rows: [balanceReads === 1
        ? { adjustment_total: 0, payment_total: 0, adjusted_total: 100_000, balance_due: 100_000 }
        : { adjustment_total: 0, payment_total: 40_000, adjusted_total: 100_000, balance_due: 60_000 }], rowCount: 1 };
    }
    if (sql.includes('INSERT INTO business_invoice_payments')) {
      return { rows: [{ id: 'payment-1' }], rowCount: 1 };
    }
    if (sql.includes('SELECT EXISTS') && sql.includes('business_invoice_payments')) {
      return { rows: [{ exists: false }], rowCount: 1 };
    }
    if (sql.includes('UPDATE business_invoices')) {
      return { rows: [{
        id: invoiceId, business_account_id: accountId, status: 'sent',
        control_state: 'controlled', record_version: 4, total_amount: 100_000,
      }], rowCount: 1 };
    }
    if (sql.includes('INSERT INTO admin_actions')) return { rows: [], rowCount: 1 };
    throw new Error(`Unexpected SQL: ${sql}`);
  });
  transactionMock.mockImplementation(async (callback: (client: unknown) => unknown) => callback({ query: queryMock }));

  const result = await recordInvoicePayment(invoiceId, {
    expectedVersion: 3,
    amount: 40_000,
    currency: 'PHP',
    method: 'bank_transfer',
    effectiveAt: '2026-09-01T04:00:00.000Z',
    externalReference: 'BANK-TRANSFER-329',
    evidenceReference: 'Private bank statement line 329',
    reason: 'Recording the first verified partial bank transfer for this statement.',
  }, '00000000-0000-4000-8000-000000000001');

  expect(result.invoice.status).toBe('sent');
  expect(result.balance.balance_due).toBe(60_000);
  expect(calls.find((sql) => sql.includes('UPDATE business_invoices'))).toContain('settlement_state');
  expect(calls.some((sql) => sql.includes('INSERT INTO business_invoice_payments'))).toBe(true);
  expect(calls.some((sql) => sql.includes('INSERT INTO admin_actions'))).toBe(true);
  expect(transactionMock).toHaveBeenCalledTimes(1);
});
