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
jest.mock('../src/services/service-area.service', () => ({
  checkCoverage: jest.fn().mockResolvedValue({ covered: true, area: { id: 'area-1' } }),
}));
jest.mock('../src/services/pricing.service', () => ({
  calculatePricing: jest.fn().mockResolvedValue({ surgeMultiplier: 1, surgeAmount: 0, appliedRule: null }),
}));
jest.mock('../src/services/settings.service', () => ({
  getSettingPercent: jest.fn().mockResolvedValue(0),
  getSettingNumber: jest.fn().mockResolvedValue(0),
}));
jest.mock('../src/services/slot-waitlist.service', () => ({ markWaitlistAsBooked: jest.fn() }));
jest.mock('../src/services/suki.service', () => ({ calculateSukiDiscountForBooking: jest.fn() }));
jest.mock('../src/services/socket.service', () => ({ emitAdminEvent: jest.fn(), ADMIN_EVENTS: { BOOKING_CREATED: 'booking:created' } }));
jest.mock('../src/services/booking/promo.service', () => ({ resolvePromo: jest.fn(), recordPromoRedemption: jest.fn() }));
jest.mock('../src/services/business.service', () => ({ resolveBookingContract: jest.fn() }));
jest.mock('../src/services/escrow.service', () => ({}));
const appendPricingTermsMock = jest.fn().mockResolvedValue({ id: 'terms-281' });
jest.mock('../src/services/booking-financial-terms.service', () => ({
  appendPricingTermsInTransaction: (...args: unknown[]) => appendPricingTermsMock(...args),
}));

import { createBooking } from '../src/services/booking.service';

it('Bug OPS-281 — fixed-price booking creation writes pricing evidence in the booking transaction', async () => {
  queryMock.mockResolvedValueOnce({
    rows: [{ base_price: '40000', pricing_type: 'fixed', hourly_rate: null }], rowCount: 1,
  });
  const client = {
    query: jest.fn(async (sql: string) => {
      if (/INSERT INTO bookings/.test(sql)) return { rows: [{
        id: 'booking-281', customer_id: 'customer-281', provider_id: null,
        status: 'requested', service_price: 40000, service_fee: 0, total_amount: 40000,
      }], rowCount: 1 };
      throw new Error(`Unexpected transaction query: ${sql}`);
    }),
  };
  transactionMock.mockImplementation(async (callback: (tx: typeof client) => Promise<unknown>) => callback(client));

  await createBooking({
    customerId: 'customer-281', categoryId: 'category-1', subcategoryId: 'subcategory-1',
    bookingType: 'fixed_price', description: 'Repair the leaking pipe',
    address: 'Purok 5', barangay: 'Poblacion', city: 'Cebu City', province: 'Cebu',
    latitude: 10.3157, longitude: 123.8854, scheduledAt: '2026-09-02T02:00:00.000Z',
  });

  expect(appendPricingTermsMock).toHaveBeenCalledWith(client, expect.objectContaining({
    bookingId: 'booking-281', event: 'booking_priced', sourceEventId: 'booking-281',
    createdBy: 'customer-281',
  }));
});
