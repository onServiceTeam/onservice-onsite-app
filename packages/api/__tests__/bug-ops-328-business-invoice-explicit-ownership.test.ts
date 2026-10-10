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

it('Bug OPS-328 — statement preview selects only explicitly linked business bookings and preserves fee and terms evidence', async () => {
  const accountId = '00000000-0000-4000-8000-000000000328';
  const actorId = '00000000-0000-4000-8000-000000000001';
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  queryMock.mockImplementation(async (sqlValue: unknown, params: unknown[] = []) => {
    const sql = String(sqlValue);
    calls.push({ sql, params });
    if (sql.includes('pg_advisory_xact_lock')) return { rows: [{}], rowCount: 1 };
    if (sql.includes('FROM business_accounts WHERE id = $1')) {
      return { rows: [{
        id: accountId, company_name: 'Scale Co', owner_user_id: 'owner-1',
        status: 'active', record_version: 4,
      }], rowCount: 1 };
    }
    if (sql.includes('FROM bookings b')) {
      return { rows: [{
        id: 'booking-1', business_account_id: accountId, description: 'Monthly maintenance',
        scheduled_at: new Date('2026-08-15T02:00:00.000Z'), status: 'confirmed',
        service_price: 100_000, service_fee: 10_000, total_amount: 110_000,
        category_name: 'Maintenance', contract_id: 'contract-1',
        contract_account_id: accountId, contract_published_at: new Date('2026-07-01T00:00:00Z'),
        business_account_terms_version_id: 'terms-1', terms_account_id: accountId,
        payment_terms: 'net_30', volume_discount_basis_points: 500,
        booking_financial_terms_id: 'financial-1', booking_terms_state: 'final',
        claimed_invoice_id: null,
      }], rowCount: 1 };
    }
    if (sql.includes('INSERT INTO business_invoice_previews')) {
      return { rows: [{
        id: 'preview-1', expires_at: new Date('2026-09-03T00:00:00Z'),
        created_at: new Date('2026-09-02T00:00:00Z'),
      }], rowCount: 1 };
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  });
  transactionMock.mockImplementation(async (callback: (client: unknown) => unknown) => callback({ query: queryMock }));

  const preview = await previewInvoiceForAccount(accountId, {
    billingPeriodStart: '2026-08-01', billingPeriodEnd: '2026-08-31',
  }, actorId);

  const bookingQuery = calls.find((call) => call.sql.includes('FROM bookings b'))!;
  expect(bookingQuery.sql).toContain('b.business_account_id = $1');
  expect(bookingQuery.sql).not.toContain('JOIN business_members');
  expect(bookingQuery.params[0]).toBe(accountId);
  expect(preview.exceptions).toEqual([]);
  expect(preview.groups).toHaveLength(1);
  expect(preview.groups[0]).toMatchObject({
    subtotal: 110_000,
    discountAmount: 5_000,
    taxAmount: 0,
    totalAmount: 105_000,
    accountTermsVersionId: 'terms-1',
  });
  expect(preview.groups[0]!.items[0]).toMatchObject({
    servicePrice: 100_000,
    serviceFee: 10_000,
    sourceBookingTotal: 110_000,
    bookingFinancialTermsId: 'financial-1',
  });
});
