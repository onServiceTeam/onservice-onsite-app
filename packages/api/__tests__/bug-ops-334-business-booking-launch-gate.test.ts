const dbQueryMock = jest.fn();
const dbTransactionMock = jest.fn();
const contractResolverMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: {
    query: (...args: unknown[]) => dbQueryMock(...args),
    transaction: (...args: unknown[]) => dbTransactionMock(...args),
  },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('../src/services/settings.service', () => ({
  getSettingBoolean: jest.fn().mockResolvedValue(false),
  getSettingPercent: jest.fn().mockResolvedValue(0),
  getSettingNumber: jest.fn().mockResolvedValue(0),
}));
jest.mock('../src/services/service-area.service', () => ({
  checkCoverage: jest.fn().mockResolvedValue({ covered: true, area: { id: 'area-1' } }),
}));
jest.mock('../src/services/business.service', () => ({
  resolveBookingContract: (...args: unknown[]) => contractResolverMock(...args),
}));
jest.mock('../src/services/pricing.service', () => ({ calculatePricing: jest.fn() }));
jest.mock('../src/services/slot-waitlist.service', () => ({ markWaitlistAsBooked: jest.fn() }));
jest.mock('../src/services/suki.service', () => ({ calculateSukiDiscountForBooking: jest.fn() }));
jest.mock('../src/services/socket.service', () => ({ emitAdminEvent: jest.fn(), ADMIN_EVENTS: {} }));
jest.mock('../src/services/booking/promo.service', () => ({
  resolvePromo: jest.fn(), recordPromoRedemption: jest.fn(),
}));
jest.mock('../src/services/booking-financial-terms.service', () => ({
  appendPricingTermsInTransaction: jest.fn(),
}));
jest.mock('../src/services/business-invoice-control.service', () => ({
  assertBusinessCreditAvailableInTransaction: jest.fn(),
}));

import { createBooking } from '../src/services/booking.service';

it('Bug OPS-334 — contracted booking fails closed while provider settlement and dispute operations remain launch-held', async () => {
  await expect(createBooking({
    customerId: '00000000-0000-4000-8000-000000000334',
    categoryId: '00000000-0000-4000-8000-000000000335',
    subcategoryId: '00000000-0000-4000-8000-000000000336',
    bookingType: 'fixed_price',
    description: 'Business maintenance visit',
    address: '123 Test Street',
    barangay: 'Lahug',
    city: 'Cebu City',
    province: 'Cebu',
    latitude: 10.3157,
    longitude: 123.8854,
    scheduledAt: '2026-09-15T01:00:00.000Z',
    businessAccountId: '00000000-0000-4000-8000-000000000337',
  })).rejects.toMatchObject({ statusCode: 409 });

  expect(contractResolverMock).not.toHaveBeenCalled();
  expect(dbQueryMock).not.toHaveBeenCalled();
  expect(dbTransactionMock).not.toHaveBeenCalled();
});
