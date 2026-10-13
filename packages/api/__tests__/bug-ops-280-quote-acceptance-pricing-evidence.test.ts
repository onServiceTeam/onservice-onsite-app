// D38 Milestone 2 (package P2) update: acceptQuote now reads
// request_slot_lead_minutes (getRequestPolicy), the quote's earliest date and
// window, and the database clock, and returns the job time it set plus the
// sibling quotes it closed. This quote has no slot (a quote sent before D38),
// so the booking keeps its job time. The bug's assertion, final pricing
// evidence recorded in the acceptance transaction, is unchanged.
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
  getRequestPolicy: jest.fn().mockResolvedValue({ slotLeadMinutes: 60 }),
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
  const scheduledAt = new Date(Date.now() + 3 * 86_400_000);
  const client = { query: jest.fn(async (sql: string) => {
    if (/FROM bookings/.test(sql)) return { rows: [{
      id: 'booking-280', customer_id: 'customer-280', provider_id: null,
      booking_type: 'quote_based', status: 'quoted', service_price: 0,
      service_fee: 0, total_amount: 0, scheduled_at: scheduledAt,
    }], rowCount: 1 };
    if (/FROM booking_quotes/.test(sql)) return { rows: [{
      id: 'quote-280', provider_id: 'provider-280', quoted_price: 25000,
      earliest_date: null, earliest_time_window: null,
    }], rowCount: 1 };
    if (/clock_timestamp\(\)/.test(sql)) return { rows: [{
      db_now: new Date(), day_offset: null, slot_start: null, slot_end: null,
    }], rowCount: 1 };
    return { rows: [], rowCount: 1 };
  }) };
  transactionMock.mockImplementation(async (callback: (tx: typeof client) => Promise<unknown>) => callback(client));

  await expect(acceptQuote('booking-280', 'quote-280', 'customer-280')).resolves.toEqual({
    quoteId: 'quote-280', providerId: 'provider-280', totalAmount: 25000,
    scheduledAt, scheduledWindow: null, notSelected: [],
  });

  expect(appendPricingTermsMock).toHaveBeenCalledWith(client, {
    bookingId: 'booking-280', event: 'quote_accepted', sourceEventId: 'quote-280',
    createdBy: 'customer-280',
    metadata: { quoteId: 'quote-280', quotedPriceCentavos: 25000, sukiDiscountCentavos: 0 },
  });
});
