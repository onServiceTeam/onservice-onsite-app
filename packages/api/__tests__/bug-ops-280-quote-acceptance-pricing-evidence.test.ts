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
jest.mock('../src/services/suki.service', () => ({
  calculateSukiDiscountForBooking: jest.fn().mockResolvedValue({ discountAmount: 0 }),
}));
jest.mock('../src/services/settings.service', () => ({
  getSettingPercent: jest.fn().mockResolvedValue(0),
  getSettingNumber: jest.fn().mockResolvedValue(0),
}));
const appendPricingTermsMock = jest.fn().mockResolvedValue({ id: 'terms-280' });
jest.mock('../src/services/booking-financial-terms.service', () => ({
  appendPricingTermsInTransaction: (...args: unknown[]) => appendPricingTermsMock(...args),
}));
jest.mock('../src/services/service-area.service', () => ({ checkCoverage: jest.fn() }));
jest.mock('../src/services/pricing.service', () => ({ calculatePricing: jest.fn() }));
jest.mock('../src/services/slot-waitlist.service', () => ({ markWaitlistAsBooked: jest.fn() }));
jest.mock('../src/services/socket.service', () => ({ emitAdminEvent: jest.fn(), ADMIN_EVENTS: {} }));
jest.mock('../src/services/booking/promo.service', () => ({ resolvePromo: jest.fn(), recordPromoRedemption: jest.fn() }));
jest.mock('../src/services/business.service', () => ({ resolveBookingContract: jest.fn() }));
jest.mock('../src/services/escrow.service', () => ({}));

import { acceptQuote } from '../src/services/booking.service';

it('Bug OPS-280 — accepting a provider quote records final pricing evidence in the acceptance transaction', async () => {
  const client = { query: jest.fn(async (sql: string) => {
    if (/FROM bookings/.test(sql)) return { rows: [{
      id: 'booking-280', customer_id: 'customer-280', provider_id: null,
      booking_type: 'quote_based', status: 'quoted', service_price: 0,
      service_fee: 0, total_amount: 0,
    }], rowCount: 1 };
    if (/FROM booking_quotes/.test(sql)) return { rows: [{
      id: 'quote-280', provider_id: 'provider-280', quoted_price: 25000,
    }], rowCount: 1 };
    return { rows: [], rowCount: 1 };
  }) };
  transactionMock.mockImplementation(async (callback: (tx: typeof client) => Promise<unknown>) => callback(client));

  await expect(acceptQuote('booking-280', 'quote-280', 'customer-280')).resolves.toEqual({
    quoteId: 'quote-280', providerId: 'provider-280', totalAmount: 25000,
  });

  expect(appendPricingTermsMock).toHaveBeenCalledWith(client, {
    bookingId: 'booking-280', event: 'quote_accepted', sourceEventId: 'quote-280',
    createdBy: 'customer-280',
    metadata: { quoteId: 'quote-280', quotedPriceCentavos: 25000, sukiDiscountCentavos: 0 },
  });
});
