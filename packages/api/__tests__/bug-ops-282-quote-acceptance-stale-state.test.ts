const transactionMock = jest.fn();
jest.mock('../src/models/db', () => ({
  db: { query: jest.fn(), transaction: (...args: unknown[]) => transactionMock(...args) },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('../src/services/booking-financial-terms.service', () => ({ appendPricingTermsInTransaction: jest.fn() }));
jest.mock('../src/services/suki.service', () => ({ calculateSukiDiscountForBooking: jest.fn() }));
jest.mock('../src/services/settings.service', () => ({ getSettingPercent: jest.fn(), getSettingNumber: jest.fn() }));
jest.mock('../src/services/service-area.service', () => ({ checkCoverage: jest.fn() }));
jest.mock('../src/services/pricing.service', () => ({ calculatePricing: jest.fn() }));
jest.mock('../src/services/slot-waitlist.service', () => ({ markWaitlistAsBooked: jest.fn() }));
jest.mock('../src/services/socket.service', () => ({ emitAdminEvent: jest.fn(), ADMIN_EVENTS: {} }));
jest.mock('../src/services/booking/promo.service', () => ({ resolvePromo: jest.fn(), recordPromoRedemption: jest.fn() }));
jest.mock('../src/services/business.service', () => ({ resolveBookingContract: jest.fn() }));
jest.mock('../src/services/escrow.service', () => ({}));

import { acceptQuote } from '../src/services/booking.service';

it('Bug OPS-282 — quote acceptance rejects a booking resolved by another request before making writes', async () => {
  const client = { query: jest.fn().mockResolvedValue({ rows: [{
    id: 'booking-282', customer_id: 'customer-282', status: 'payment_pending',
  }], rowCount: 1 }) };
  transactionMock.mockImplementation(async (callback: (tx: typeof client) => Promise<unknown>) => callback(client));

  await expect(acceptQuote('booking-282', 'quote-282', 'customer-282')).rejects.toMatchObject({
    statusCode: 409,
  });

  expect(client.query).toHaveBeenCalledTimes(1);
});
