const dbQueryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => dbQueryMock(...args), transaction: jest.fn() },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { getBookingDetail } from '../src/services/booking-admin.service';

it('Bug OPS-389 - Booking 360 returns the immutable business account, contract, terms, and statement trail', async () => {
  dbQueryMock.mockResolvedValueOnce({
    rowCount: 1,
    rows: [{
      id: 'booking-1', status: 'confirmed', escrow_status: null, booking_type: 'fixed_price',
      scheduled_at: null, completed_at: null, confirmed_at: null, cancelled_at: null,
      cancellation_reason: null, service_price: '10000', service_fee: '1000', total_amount: '11000',
      conversation_id: null, address: null, barangay: null, city: 'Cebu City', province: 'Cebu',
      created_at: new Date('2026-09-03T00:00:00.000Z'), category_id: null, category_name: null,
      subcategory_id: null, subcategory_name: null, customer_id: null, customer_first_name: null,
      customer_last_name: null, customer_phone: null, customer_email: null, customer_avatar: null,
      provider_id: null, provider_user_id: null, provider_business_name: null, provider_tier: null,
      provider_rating: null, provider_total_jobs: null, provider_first_name: null,
      provider_last_name: null, provider_phone: null, provider_avatar: null,
      business_account_id: '11111111-1111-4111-8111-111111111111',
      business_company_name: 'Cebu Build Co', business_account_status: 'active',
      contract_id: '22222222-2222-4222-8222-222222222222',
      contract_account_id: '11111111-1111-4111-8111-111111111111',
      contract_type: 'recurring', contract_frequency: 'monthly', contract_status: 'active',
      business_account_terms_version_id: '33333333-3333-4333-8333-333333333333',
      terms_account_id: '11111111-1111-4111-8111-111111111111', terms_version: 4,
      terms_effective_from: new Date('2026-09-01T00:00:00.000Z'), billing_mode: 'business_terms',
      business_statements: [{
        id: '44444444-4444-4444-8444-444444444444',
        businessAccountId: '11111111-1111-4111-8111-111111111111',
        number: 'BS-2026-0042', status: 'sent', settlementState: 'open',
      }],
    }],
  });

  const detail = await getBookingDetail('booking-1');

  expect(detail.businessContext).toEqual({
    billingMode: 'business_terms',
    linkageState: 'complete',
    linkageIssues: [],
    account: {
      id: '11111111-1111-4111-8111-111111111111',
      companyName: 'Cebu Build Co',
      status: 'active',
    },
    contract: {
      id: '22222222-2222-4222-8222-222222222222',
      businessAccountId: '11111111-1111-4111-8111-111111111111',
      contractType: 'recurring',
      frequency: 'monthly',
      status: 'active',
    },
    termsVersion: {
      id: '33333333-3333-4333-8333-333333333333',
      businessAccountId: '11111111-1111-4111-8111-111111111111',
      version: 4,
      effectiveFrom: '2026-09-01T00:00:00.000Z',
    },
    statements: [{
      id: '44444444-4444-4444-8444-444444444444',
      businessAccountId: '11111111-1111-4111-8111-111111111111',
      number: 'BS-2026-0042',
      status: 'sent',
      settlementState: 'open',
    }],
  });
  const sql = dbQueryMock.mock.calls[0]?.[0] as string;
  expect(sql).toMatch(/LEFT JOIN business_accounts ba/);
  expect(sql).toMatch(/LEFT JOIN business_contracts bc/);
  expect(sql).toMatch(/LEFT JOIN business_account_term_versions batv/);
  expect(sql).toMatch(/FROM business_invoice_items bii/);
});
