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

import { reverseInvoicePayment } from '../src/services/business-invoice-control.service';

it('Bug OPS-333 — a partial payment reversal appends evidence and reopens the statement without rewriting the original payment', async () => {
  const invoiceId = '00000000-0000-4000-8000-000000000334';
  const paymentId = '00000000-0000-4000-8000-000000000335';
  const accountId = '00000000-0000-4000-8000-000000000336';
  const effectiveAt = new Date(Date.now() - 60_000);
  let balanceReads = 0;
  const calls: string[] = [];

  queryMock.mockImplementation(async (sqlValue: unknown) => {
    const sql = String(sqlValue);
    calls.push(sql);
    if (sql.includes('SELECT business_account_id FROM business_invoices')) {
      return { rows: [{ business_account_id: accountId }], rowCount: 1 };
    }
    if (sql.includes('pg_advisory_xact_lock')) return { rows: [{}], rowCount: 1 };
    if (sql.includes('SELECT * FROM business_invoices') && sql.includes('FOR UPDATE')) {
      return { rows: [{
        id: invoiceId,
        business_account_id: accountId,
        status: 'paid',
        control_state: 'controlled',
        record_version: 6,
        total_amount: 100_000,
        currency: 'PHP',
        finalized_at: new Date(effectiveAt.getTime() - 120_000),
      }], rowCount: 1 };
    }
    if (sql.includes('SELECT NOW() AS now')) {
      return { rows: [{ now: new Date() }], rowCount: 1 };
    }
    if (sql.includes('FROM business_invoice_payments payment')) {
      return { rows: [{
        id: paymentId,
        invoice_id: invoiceId,
        entry_type: 'payment',
        amount: 100_000,
        reversed_amount: 0,
        currency: 'PHP',
        method: 'bank_transfer',
        effective_at: new Date(effectiveAt.getTime() - 60_000),
        external_reference: 'BANK-ORIGINAL-333',
      }], rowCount: 1 };
    }
    if (sql.includes('SELECT EXISTS') && sql.includes('business_invoice_payments')) {
      return { rows: [{ exists: false }], rowCount: 1 };
    }
    if (sql.includes('AS balance_due')) {
      balanceReads += 1;
      return { rows: [balanceReads === 1
        ? { adjustment_total: 0, payment_total: 100_000, adjusted_total: 100_000, balance_due: 0 }
        : { adjustment_total: 0, payment_total: 75_000, adjusted_total: 100_000, balance_due: 25_000 }], rowCount: 1 };
    }
    if (sql.includes('INSERT INTO business_invoice_payments')) {
      return { rows: [{ id: 'reversal-1' }], rowCount: 1 };
    }
    if (sql.includes('UPDATE business_invoices')) {
      return { rows: [{
        id: invoiceId,
        business_account_id: accountId,
        status: 'sent',
        control_state: 'controlled',
        record_version: 7,
        total_amount: 100_000,
        currency: 'PHP',
      }], rowCount: 1 };
    }
    if (sql.includes('INSERT INTO admin_actions')) return { rows: [], rowCount: 1 };
    throw new Error(`Unexpected SQL: ${sql}`);
  });
  transactionMock.mockImplementation(async (callback: (client: unknown) => unknown) => callback({ query: queryMock }));

  const result = await reverseInvoicePayment(invoiceId, paymentId, {
    expectedVersion: 6,
    amount: 25_000,
    currency: 'PHP',
    effectiveAt: effectiveAt.toISOString(),
    externalReference: 'BANK-REFUND-333',
    evidenceReference: 'Private refund receipt line 333',
    reason: 'Return part of the recorded transfer after the approved account credit.',
  }, '00000000-0000-4000-8000-000000000001');

  expect(result.reversalId).toBe('reversal-1');
  expect(result.invoice.status).toBe('sent');
  expect(result.balance.balance_due).toBe(25_000);
  expect(calls.find((sql) => sql.includes('UPDATE business_invoices'))).toContain('settlement_state');
  expect(calls.filter((sql) => sql.includes('INSERT INTO business_invoice_payments'))).toHaveLength(1);
  expect(calls.some((sql) => sql.includes('INSERT INTO admin_actions'))).toBe(true);
});
