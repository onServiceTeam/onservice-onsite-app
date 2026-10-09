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

it('Bug OPS-345 — PostgreSQL BIGINT strings reconcile as safe statement money instead of false amount mismatches', async () => {
  const accountId = '00000000-0000-4000-8000-000000000345';
  queryMock.mockImplementation(async (sqlValue: unknown) => {
    const sql = String(sqlValue);
    if (sql.includes('pg_advisory_xact_lock')) return { rows: [{}], rowCount: 1 };
    if (sql.includes('FROM business_accounts WHERE id = $1')) {
      return { rows: [{
        id: accountId, company_name: 'BIGINT Co', owner_user_id: 'owner-1',
        status: 'active', record_version: 2,
      }], rowCount: 1 };
    }
    if (sql.includes('FROM bookings b')) {
      return { rows: [{
        id: 'booking-bigint', business_account_id: accountId, description: 'Enterprise site care',
        scheduled_at: new Date('2026-08-15T02:00:00.000Z'), status: 'confirmed',
        service_price: '2500000000', service_fee: '250000000', total_amount: '2750000000',
        category_name: 'Maintenance', contract_id: 'contract-bigint',
        contract_account_id: accountId, contract_published_at: new Date('2026-07-01T00:00:00.000Z'),
        business_account_terms_version_id: 'terms-bigint', terms_account_id: accountId,
        payment_terms: 'net_30', volume_discount_basis_points: 500,
        booking_financial_terms_id: 'financial-bigint', booking_terms_state: 'final',
        claimed_invoice_id: null,
      }], rowCount: 1 };
    }
    if (sql.includes('INSERT INTO business_invoice_previews')) {
      return { rows: [{
        id: 'preview-bigint',
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
  }, '00000000-0000-4000-8000-000000000001');

  expect(preview.exceptions).toEqual([]);
  expect(preview.groups[0]).toMatchObject({
    subtotal: 2_750_000_000,
    discountAmount: 125_000_000,
    totalAmount: 2_625_000_000,
  });
});
