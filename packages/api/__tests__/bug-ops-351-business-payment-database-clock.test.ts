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

it('Bug OPS-351 — future payment evidence is rejected against the database clock even when the app-server clock disagrees', async () => {
  const invoiceId = '00000000-0000-4000-8000-000000000351';
  const accountId = '00000000-0000-4000-8000-000000000352';
  jest.useFakeTimers().setSystemTime(new Date('2030-01-01T00:00:00.000Z'));

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
        record_version: 1,
        total_amount: '100000',
        currency: 'PHP',
        finalized_at: new Date('2026-09-02T04:00:00.000Z'),
      }], rowCount: 1 };
    }
    if (sql.includes('SELECT NOW() AS now')) {
      return { rows: [{ now: new Date('2026-09-02T05:00:00.000Z') }], rowCount: 1 };
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  });
  transactionMock.mockImplementation(async (callback: (client: unknown) => unknown) => callback({ query: queryMock }));

  try {
    await expect(recordInvoicePayment(invoiceId, {
      expectedVersion: 1,
      amount: 10_000,
      currency: 'PHP',
      method: 'bank_transfer',
      effectiveAt: '2026-09-02T05:06:00.000Z',
      externalReference: 'BANK-FUTURE-351',
      evidenceReference: 'Private bank line 351',
      reason: 'Attempt to record a bank entry after the authoritative database time.',
    }, '00000000-0000-4000-8000-000000000001')).rejects.toMatchObject({ statusCode: 400 });

    expect(queryMock.mock.calls.some((call) => String(call[0]).includes('INSERT INTO business_invoice_payments'))).toBe(false);
  } finally {
    jest.useRealTimers();
  }
});
