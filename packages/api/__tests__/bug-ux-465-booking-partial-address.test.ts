const dbQueryMock = jest.fn();
jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => dbQueryMock(...args), transaction: jest.fn() },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { getBookingDetail } from '../src/services/booking-admin.service';

it('Bug UX-465 — Booking 360 preserves a partial service address instead of hiding it unless every field exists', async () => {
  dbQueryMock.mockResolvedValueOnce({
    rowCount: 1,
    rows: [{
      id: 'booking-1', status: 'requested', escrow_status: 'pending', booking_type: 'fixed_price',
      scheduled_at: null, completed_at: null, confirmed_at: null, cancelled_at: null,
      cancellation_reason: null, service_price: '10000', service_fee: '1000', total_amount: '11000',
      conversation_id: null, address: null, barangay: 'Lahug', city: null, province: null,
      created_at: new Date('2026-08-30T01:00:00.000Z'), category_id: null, category_name: null,
      subcategory_id: null, subcategory_name: null, customer_id: null, customer_first_name: null,
      customer_last_name: null, customer_phone: null, customer_email: null, customer_avatar: null,
      provider_id: null, provider_user_id: null, provider_business_name: null, provider_tier: null,
      provider_rating: null, provider_total_jobs: null, provider_first_name: null,
      provider_last_name: null, provider_phone: null, provider_avatar: null,
    }],
  });

  const detail = await getBookingDetail('booking-1');

  expect(detail.address).toEqual({ full: '', barangay: 'Lahug', city: '', province: '' });
});
