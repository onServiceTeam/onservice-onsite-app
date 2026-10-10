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

import {
  finalizeInvoice,
  prepareInvoiceDrafts,
  previewInvoiceForAccount,
} from '../src/services/business-invoice-control.service';

it('Bug OPS-341 — Net terms start when a controlled statement is finalized, not when its draft is prepared', async () => {
  jest.useFakeTimers().setSystemTime(new Date('2026-09-01T00:00:00.000Z'));
  const accountId = '00000000-0000-4000-8000-000000000341';
  const actorId = '00000000-0000-4000-8000-000000000001';
  const previewId = '00000000-0000-4000-8000-000000000342';
  const invoiceId = '00000000-0000-4000-8000-000000000343';
  let previewFingerprint = '';
  let manifestHash = '';
  let preparedDueDate = '';
  let finalizedDueDate = '';
  let preparedInsertSql = '';
  let finalizedUpdateSql = '';

  const candidate = {
    id: 'booking-341',
    business_account_id: accountId,
    description: 'Monthly site care',
    scheduled_at: new Date('2026-08-15T02:00:00.000Z'),
    status: 'confirmed',
    service_price: 100_000,
    service_fee: 10_000,
    total_amount: 110_000,
    category_name: 'Maintenance',
    contract_id: 'contract-341',
    contract_account_id: accountId,
    contract_published_at: new Date('2026-07-01T00:00:00.000Z'),
    business_account_terms_version_id: 'terms-341',
    terms_account_id: accountId,
    payment_terms: 'net_15',
    volume_discount_basis_points: 0,
    booking_financial_terms_id: 'financial-341',
    booking_terms_state: 'final',
    claimed_invoice_id: null,
  };

  queryMock.mockImplementation(async (sqlValue: unknown, params: unknown[] = []) => {
    const sql = String(sqlValue);
    if (sql.includes('pg_advisory_xact_lock')) return { rows: [{}], rowCount: 1 };
    if (sql.includes('SELECT business_account_id FROM business_invoices')) {
      return { rows: [{ business_account_id: accountId }], rowCount: 1 };
    }
    if (sql.includes('FROM business_accounts WHERE id = $1')) {
      return { rows: [{
        id: accountId,
        company_name: 'Due Date Co',
        owner_user_id: '00000000-0000-4000-8000-000000000344',
        status: 'active',
        record_version: 2,
      }], rowCount: 1 };
    }
    if (sql.includes('FROM bookings b')) return { rows: [candidate], rowCount: 1 };
    if (sql.includes('INSERT INTO business_invoice_previews')) {
      previewFingerprint = String(params[5]);
      return { rows: [{
        id: previewId,
        expires_at: new Date('2026-09-01T00:30:00.000Z'),
        created_at: new Date('2026-09-01T00:00:00.000Z'),
      }], rowCount: 1 };
    }
    if (sql.includes('SELECT * FROM business_invoice_previews')) {
      return { rows: [{
        id: previewId,
        business_account_id: accountId,
        created_by: actorId,
        account_record_version: 2,
        billing_period_start: '2026-08-01',
        billing_period_end: '2026-08-31',
        candidate_fingerprint: previewFingerprint,
        expires_at: new Date('2026-09-01T00:30:00.000Z'),
      }], rowCount: 1 };
    }
    if (sql.includes('INSERT INTO business_invoices')) {
      preparedInsertSql = sql;
      expect(params[7]).toBe(15);
      preparedDueDate = '2026-09-16';
      manifestHash = String(params[9]);
      return { rows: [{
        id: invoiceId,
        business_account_id: accountId,
        invoice_number: 'INV-202609-AAAAAA',
        billing_period_start: '2026-08-01',
        billing_period_end: '2026-08-31',
        subtotal: 110_000,
        discount_amount: 0,
        tax_amount: 0,
        total_amount: 110_000,
        status: 'draft',
        due_date: preparedDueDate,
        record_version: 1,
        control_state: 'controlled',
        settlement_state: 'open',
        currency: 'PHP',
        account_terms_version_id: 'terms-341',
        preparation_preview_id: previewId,
        manifest_hash: manifestHash,
      }], rowCount: 1 };
    }
    if (sql.includes('INSERT INTO business_invoice_items') || sql.includes('INSERT INTO admin_actions')) {
      return { rows: [], rowCount: 1 };
    }
    if (sql.includes('SELECT bi.*, ba.owner_user_id, batv.payment_terms')) {
      return { rows: [{
        id: invoiceId,
        business_account_id: accountId,
        invoice_number: 'INV-202609-AAAAAA',
        billing_period_start: '2026-08-01',
        billing_period_end: '2026-08-31',
        subtotal: 110_000,
        discount_amount: 0,
        tax_amount: 0,
        total_amount: 110_000,
        status: 'draft',
        due_date: preparedDueDate,
        record_version: 1,
        control_state: 'controlled',
        settlement_state: 'open',
        currency: 'PHP',
        account_terms_version_id: 'terms-341',
        preparation_preview_id: previewId,
        manifest_hash: manifestHash,
        owner_user_id: '00000000-0000-4000-8000-000000000344',
        payment_terms: 'net_15',
      }], rowCount: 1 };
    }
    if (sql.includes('UPDATE business_invoices')) {
      finalizedUpdateSql = sql;
      expect(params[4]).toBe(15);
      finalizedDueDate = '2026-09-25';
      return { rows: [{
        id: invoiceId,
        business_account_id: accountId,
        status: 'sent',
        due_date: finalizedDueDate,
        record_version: 2,
        owner_user_id: '00000000-0000-4000-8000-000000000344',
      }], rowCount: 1 };
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  });
  transactionMock.mockImplementation(async (callback: (client: unknown) => unknown) => callback({ query: queryMock }));

  try {
    await previewInvoiceForAccount(accountId, {
      billingPeriodStart: '2026-08-01',
      billingPeriodEnd: '2026-08-31',
    }, actorId);
    await prepareInvoiceDrafts({
      accountId,
      previewId,
      actorId,
      reason: 'Prepare a controlled statement for operator review.',
    });
    expect(preparedDueDate).toBe('2026-09-16');
    expect(preparedInsertSql).toContain("NOW() AT TIME ZONE 'Asia/Manila'");

    jest.setSystemTime(new Date('2026-09-10T00:00:00.000Z'));
    const finalized = await finalizeInvoice({
      invoiceId,
      expectedVersion: 1,
      actorId,
      reason: 'Finalize after review and start the approved Net 15 term now.',
    });

    expect(finalizedDueDate).toBe('2026-09-25');
    expect(finalizedUpdateSql).toContain("NOW() AT TIME ZONE 'Asia/Manila'");
    expect(finalized.due_date).toBe('2026-09-25');
  } finally {
    jest.useRealTimers();
  }
});
