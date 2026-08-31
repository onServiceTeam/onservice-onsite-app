const dbQueryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => dbQueryMock(...args), transaction: jest.fn() },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { getBookingDetail } from '../src/services/booking-admin.service';

it('Bug UX-711 — Booking 360 masks participant contact for ordinary admins', async () => {
  dbQueryMock
    .mockResolvedValueOnce({
      rowCount: 1,
      rows: [{
        id: 'booking-1', status: 'requested', escrow_status: null, booking_type: 'fixed_price',
        scheduled_at: null, completed_at: null, confirmed_at: null, cancelled_at: null,
        cancellation_reason: null, service_price: '10000', service_fee: '1000', total_amount: '11000',
        conversation_id: null, address: null, barangay: null, city: 'Cebu City', province: 'Cebu',
        created_at: new Date('2026-08-31T00:00:00.000Z'), category_id: null, category_name: null,
        subcategory_id: null, subcategory_name: null, customer_id: 'customer-1',
        customer_first_name: 'Joe', customer_last_name: 'Customer', customer_phone: '+639170000000',
        customer_email: 'joe@example.com', customer_avatar: null, provider_id: 'provider-1',
        provider_user_id: 'provider-user-1', provider_business_name: 'Cebu Home Pro', provider_tier: 'verified',
        provider_rating: '4.8', provider_total_jobs: 20, provider_first_name: 'Pat', provider_last_name: 'Provider',
        provider_phone: '+639170000001', provider_avatar: null,
      }],
    })
    .mockResolvedValueOnce({ rowCount: 1, rows: [{ lifetime: '3', avg: '4.5' }] });

  const detail = await getBookingDetail('booking-1', 'admin');

  expect(detail.customer?.phone).toBe('+63 9XX XXX 0000');
  expect(detail.customer?.email).toBe('j•••@example.com');
  expect(detail.provider?.phone).toBe('+63 9XX XXX 0001');
});
