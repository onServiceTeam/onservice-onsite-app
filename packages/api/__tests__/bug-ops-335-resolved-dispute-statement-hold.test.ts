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

import { previewInvoiceForAccount } from '../src/services/business-invoice-control.service';

it('Bug OPS-335 — a resolved dispute remains blocked from company billing until its settlement outcome is reconciled', async () => {
  const accountId = '00000000-0000-4000-8000-000000000335';
  const actorId = '00000000-0000-4000-8000-000000000001';

  queryMock.mockImplementation(async (sqlValue: unknown) => {
    const sql = String(sqlValue);
    if (sql.includes('pg_advisory_xact_lock')) return { rows: [{}], rowCount: 1 };
    if (sql.includes('FROM business_accounts WHERE id = $1')) {
      return { rows: [{
        id: accountId,
        company_name: 'Dispute Safety Co',
        owner_user_id: 'owner-1',
        status: 'active',
        record_version: 3,
      }], rowCount: 1 };
    }
    if (sql.includes('FROM bookings b')) {
      return { rows: [{
        id: 'booking-resolved-dispute',
        business_account_id: accountId,
        description: 'Resolved but unsettled service',
        scheduled_at: new Date('2026-08-15T02:00:00.000Z'),
        status: 'resolved',
        service_price: 100_000,
        service_fee: 10_000,
        total_amount: 110_000,
        category_name: 'Maintenance',
        contract_id: 'contract-1',
        contract_account_id: accountId,
        contract_published_at: new Date('2026-07-01T00:00:00.000Z'),
        business_account_terms_version_id: 'terms-1',
        terms_account_id: accountId,
        payment_terms: 'net_30',
        volume_discount_basis_points: 0,
        booking_financial_terms_id: 'financial-1',
        booking_terms_state: 'final',
        claimed_invoice_id: null,
      }], rowCount: 1 };
    }
    if (sql.includes('INSERT INTO business_invoice_previews')) {
      return { rows: [{
        id: 'preview-1',
        expires_at: new Date('2026-09-03T00:00:00.000Z'),
        created_at: new Date('2026-09-02T00:00:00.000Z'),
      }], rowCount: 1 };
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  });
  transactionMock.mockImplementation(async (callback: (client: unknown) => unknown) => callback({ query: queryMock }));

  const preview = await previewInvoiceForAccount(accountId, {
    billingPeriodStart: '2026-08-01',
    billingPeriodEnd: '2026-08-31',
  }, actorId);

  expect(preview.groups).toEqual([]);
  expect(preview.exceptions).toEqual([{
    bookingId: 'booking-resolved-dispute',
    code: 'dispute_resolution_settlement_unreconciled',
    message: 'The dispute decision is recorded, but its refund or provider-settlement outcome is not yet safe for company billing.',
    blocking: true,
  }]);
});
