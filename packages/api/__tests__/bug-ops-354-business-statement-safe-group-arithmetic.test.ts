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

it('Bug OPS-354 — statement grouping blocks before accumulated centavos exceed exact integer arithmetic', async () => {
  const accountId = '00000000-0000-4000-8000-000000000354';
  const candidate = (id: string) => ({
    id,
    business_account_id: accountId,
    description: 'Enterprise portfolio service',
    scheduled_at: new Date('2026-08-15T02:00:00.000Z'),
    status: 'confirmed',
    service_price: '5000000000000000',
    service_fee: '0',
    total_amount: '5000000000000000',
    category_name: 'Portfolio maintenance',
    contract_id: 'contract-safe-group',
    contract_account_id: accountId,
    contract_published_at: new Date('2026-07-01T00:00:00.000Z'),
    business_account_terms_version_id: 'terms-safe-group',
    terms_account_id: accountId,
    payment_terms: 'net_30',
    volume_discount_basis_points: 0,
    booking_financial_terms_id: `financial-${id}`,
    booking_terms_state: 'final',
    claimed_invoice_id: null,
  });

  queryMock.mockImplementation(async (sqlValue: unknown) => {
    const sql = String(sqlValue);
    if (sql.includes('pg_advisory_xact_lock')) return { rows: [{}], rowCount: 1 };
    if (sql.includes('FROM business_accounts WHERE id = $1')) {
      return { rows: [{
        id: accountId,
        company_name: 'Safe Group Co',
        owner_user_id: 'owner-354',
        status: 'active',
        record_version: 2,
      }], rowCount: 1 };
    }
    if (sql.includes('FROM bookings b')) {
      return { rows: [candidate('booking-safe-1'), candidate('booking-overflow-2')], rowCount: 2 };
    }
    if (sql.includes('INSERT INTO business_invoice_previews')) {
      return { rows: [{
        id: 'preview-354',
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

  expect(preview.groups[0]?.items.map((item) => item.bookingId)).toEqual(['booking-safe-1']);
  expect(preview.exceptions).toEqual([expect.objectContaining({
    bookingId: 'booking-overflow-2',
    code: 'statement_group_amount_overflow',
    blocking: true,
  })]);
});
