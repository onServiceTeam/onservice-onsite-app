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

it('Bug OPS-338 — external payment evidence cannot be backdated before controlled statement finalization', async () => {
  const invoiceId = '00000000-0000-4000-8000-000000000338';
  const accountId = '00000000-0000-4000-8000-000000000339';
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
        id: invoiceId, business_account_id: accountId, status: 'sent',
        control_state: 'controlled', settlement_state: 'open', record_version: 2,
        total_amount: 100_000, currency: 'PHP',
        finalized_at: new Date('2026-09-02T04:00:00.000Z'),
      }], rowCount: 1 };
    }
    if (sql.includes('SELECT NOW() AS now')) {
      return { rows: [{ now: new Date('2026-09-02T05:00:00.000Z') }], rowCount: 1 };
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  });
  transactionMock.mockImplementation(async (callback: (client: unknown) => unknown) => callback({ query: queryMock }));

  await expect(recordInvoicePayment(invoiceId, {
    expectedVersion: 2,
    amount: 50_000,
    currency: 'PHP',
    method: 'bank_transfer',
    effectiveAt: '2026-09-02T03:59:59.000Z',
    externalReference: 'BANK-338',
    evidenceReference: 'Private bank line 338',
    reason: 'Attempt to record evidence before the statement existed.',
  }, '00000000-0000-4000-8000-000000000001')).rejects.toMatchObject({ statusCode: 400 });

  expect(calls.some((sql) => sql.includes('INSERT INTO business_invoice_payments'))).toBe(false);
});
