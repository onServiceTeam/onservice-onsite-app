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
  prepareInvoiceDrafts,
  previewInvoiceForAccount,
} from '../src/services/business-invoice-control.service';

it('Bug OPS-332 — one preview prepares separate terms-version drafts with a shared batch and correctly ordered immutable item evidence', async () => {
  const accountId = '00000000-0000-4000-8000-000000000332';
  const actorId = '00000000-0000-4000-8000-000000000001';
  const previewId = '00000000-0000-4000-8000-000000000333';
  const invoiceInserts: Array<{ sql: string; params: unknown[] }> = [];
  const itemInserts: Array<{ sql: string; params: unknown[] }> = [];
  let previewFingerprint = '';

  const candidateRows = [1, 2].map((number) => ({
    id: `booking-${number}`,
    business_account_id: accountId,
    description: `Service ${number}`,
    scheduled_at: new Date(`2026-08-${number === 1 ? '05' : '20'}T02:00:00.000Z`),
    status: 'confirmed',
    service_price: number * 100_000,
    service_fee: number * 10_000,
    total_amount: number * 110_000,
    category_name: 'Maintenance',
    contract_id: `contract-${number}`,
    contract_account_id: accountId,
    contract_published_at: new Date('2026-07-01T00:00:00.000Z'),
    business_account_terms_version_id: `terms-${number}`,
    terms_account_id: accountId,
    payment_terms: number === 1 ? 'net_15' : 'net_30',
    volume_discount_basis_points: number === 1 ? 0 : 500,
    booking_financial_terms_id: `financial-${number}`,
    booking_terms_state: 'final',
    claimed_invoice_id: null,
  }));

  queryMock.mockImplementation(async (sqlValue: unknown, params: unknown[] = []) => {
    const sql = String(sqlValue);
    if (sql.includes('pg_advisory_xact_lock')) return { rows: [{}], rowCount: 1 };
    if (sql.includes('FROM business_accounts WHERE id = $1')) {
      return { rows: [{
        id: accountId,
        company_name: 'Versioned Terms Co',
        owner_user_id: 'owner-1',
        status: 'active',
        record_version: 7,
      }], rowCount: 1 };
    }
    if (sql.includes('FROM bookings b')) return { rows: candidateRows, rowCount: candidateRows.length };
    if (sql.includes('INSERT INTO business_invoice_previews')) {
      previewFingerprint = String(params[5]);
      return { rows: [{
        id: previewId,
        expires_at: new Date(Date.now() + 60_000),
        created_at: new Date(),
      }], rowCount: 1 };
    }
    if (sql.includes('SELECT * FROM business_invoice_previews')) {
      return { rows: [{
        id: previewId,
        business_account_id: accountId,
        created_by: actorId,
        account_record_version: 7,
        billing_period_start: '2026-08-01',
        billing_period_end: '2026-08-31',
        candidate_fingerprint: previewFingerprint,
        expires_at: new Date(Date.now() + 60_000),
      }], rowCount: 1 };
    }
    if (sql.includes('INSERT INTO business_invoices')) {
      invoiceInserts.push({ sql, params });
      return { rows: [{
        id: `invoice-${invoiceInserts.length}`,
        business_account_id: accountId,
        status: 'draft',
        control_state: 'controlled',
        record_version: 1,
        currency: 'PHP',
        preparation_preview_id: previewId,
      }], rowCount: 1 };
    }
    if (sql.includes('INSERT INTO business_invoice_items')) {
      itemInserts.push({ sql, params });
      return { rows: [], rowCount: 1 };
    }
    if (sql.includes('INSERT INTO admin_actions')) return { rows: [], rowCount: 1 };
    throw new Error(`Unexpected SQL: ${sql}`);
  });
  transactionMock.mockImplementation(async (callback: (client: unknown) => unknown) => callback({ query: queryMock }));

  await previewInvoiceForAccount(accountId, {
    billingPeriodStart: '2026-08-01',
    billingPeriodEnd: '2026-08-31',
  }, actorId);
  const drafts = await prepareInvoiceDrafts({
    accountId,
    previewId,
    actorId,
    reason: 'Prepare immutable drafts for both approved terms versions.',
  });

  expect(drafts).toHaveLength(2);
  expect(invoiceInserts).toHaveLength(2);
  expect(invoiceInserts.every((insert) => insert.params[10] === previewId)).toBe(true);
  expect(itemInserts).toHaveLength(2);
  for (const insert of itemInserts) {
    const normalizedSql = insert.sql.replace(/\s+/g, ' ');
    expect(normalizedSql).toContain('$4, $5, 1, $6');
    expect(insert.params[4]).toMatch(/^2026-08-/);
    expect(insert.params[13]).toBe(1);
  }
});
