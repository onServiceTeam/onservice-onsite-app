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

it('Bug OPS-355 — a write-off cannot exceed the remaining balance and manufacture customer credit', async () => {
  const invoiceId = '00000000-0000-4000-8000-000000000355';
  const accountId = '00000000-0000-4000-8000-000000000356';

  queryMock.mockImplementation(async (sqlValue: unknown) => {
    const sql = String(sqlValue);
    if (sql.includes('SELECT business_account_id FROM business_invoices')) {
      return { rows: [{ business_account_id: accountId }], rowCount: 1 };
    }
    if (sql.includes('pg_advisory_xact_lock')) return { rows: [{}], rowCount: 1 };
    if (sql.includes('SELECT * FROM business_invoices') && sql.includes('FOR UPDATE')) {
      return { rows: [{
        id: invoiceId,
        business_account_id: accountId,
        status: 'sent',
        control_state: 'controlled',
        settlement_state: 'open',
        record_version: 5,
        total_amount: 100_000,
        currency: 'PHP',
        finalized_at: new Date('2026-09-01T00:00:00.000Z'),
      }], rowCount: 1 };
    }
    if (sql.includes('AS balance_due')) {
      return { rows: [{
        adjustment_total: 0,
        payment_total: 80_000,
        adjusted_total: 100_000,
        balance_due: 20_000,
      }], rowCount: 1 };
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  });
  transactionMock.mockImplementation(async (callback: (client: unknown) => unknown) => callback({ query: queryMock }));

  await expect(recordInvoiceAdjustment(invoiceId, {
    expectedVersion: 5,
    adjustmentType: 'write_off',
    amount: 30_000,
    currency: 'PHP',
    evidenceReference: 'APPROVAL-355',
    reason: 'Approve only the remaining uncollectible statement balance.',
  }, '00000000-0000-4000-8000-000000000001')).rejects.toMatchObject({
    message: 'A write-off cannot exceed the current positive balance due.',
    statusCode: 409,
  });

  expect(queryMock.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO business_invoice_adjustments'))).toBe(false);
});
