// Phase 200 — createBooking honors a B2B contract's agreed_rate.
// When a booking is placed with a businessAccountId and a contract resolves,
// the agreed_rate replaces the catalog base price, surge + promo are skipped,
// and business_account_id + contract_id are stamped. With no businessAccountId
// (every normal booking), behavior is unchanged.

const dbQueryMock = jest.fn();
const dbTransactionMock = jest.fn();
jest.mock('../../src/models/db', () => ({
  db: { query: (...a: unknown[]) => dbQueryMock(...a), transaction: (cb: unknown) => dbTransactionMock(cb) },
}));
jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
const pricingMock = { calculatePricing: jest.fn() };
jest.mock('../../src/services/pricing.service', () => pricingMock);
jest.mock('../../src/services/slot-waitlist.service', () => ({ markWaitlistAsBooked: jest.fn() }));
jest.mock('../../src/services/suki.service', () => ({ calculateSukiDiscountForBooking: jest.fn() }));
jest.mock('../../src/services/socket.service', () => ({ emitAdminEvent: jest.fn(), ADMIN_EVENTS: {} }));
jest.mock('../../src/services/booking/promo.service', () => ({ resolvePromo: jest.fn(), recordPromoRedemption: jest.fn() }));
jest.mock('../../src/services/settings.service', () => ({
  getSettingPercent: jest.fn().mockResolvedValue(0.1),
  getSettingNumber: jest.fn().mockImplementation((k: string) =>
    Promise.resolve(k === 'service_fee_min' ? 2500 : k === 'service_fee_max' ? 50000 : 0)),
}));
jest.mock('../../src/services/service-area.service', () => ({
  checkCoverage: jest.fn().mockResolvedValue({ covered: true, area: { id: 'area-1' } }),
}));
jest.mock('../../src/services/booking-financial-terms.service', () => ({
  appendPricingTermsInTransaction: jest.fn().mockResolvedValue({ id: 'terms-1' }),
}));
const businessMock = { resolveBookingContract: jest.fn() };
jest.mock('../../src/services/business.service', () => businessMock);

import { createBooking } from '../../src/services/booking.service';

const BASE = {
  customerId: 'c-1', categoryId: 'cat-1', subcategoryId: 'sub-1',
  bookingType: 'fixed_price' as const, description: 'Test booking',
  address: '123 Test St', barangay: 'B', city: 'C', province: 'P',
  latitude: 10.3157, longitude: 123.8854,
  scheduledAt: '2026-04-15T08:00:00Z',
};

function mockInsertCapture(): { params: unknown[] } {
  const captured: { params: unknown[] } = { params: [] };
  dbTransactionMock.mockImplementationOnce(async (cb: unknown) => {
    const clientQuery = jest.fn(async (sql: string, params: unknown[] = []) => {
      if (/INSERT INTO bookings/.test(sql)) {
        captured.params = params;
        return { rows: [{ id: 'booking-1', service_price: params[12], business_account_id: params[20], contract_id: params[21] }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });
    return (cb as (c: { query: typeof clientQuery }) => Promise<unknown>)({ query: clientQuery });
  });
  return captured;
}

beforeEach(() => {
  dbQueryMock.mockReset();
  dbTransactionMock.mockReset();
  pricingMock.calculatePricing.mockResolvedValue({ surgeMultiplier: 1, surgeAmount: 0, appliedRule: null });
  businessMock.resolveBookingContract.mockReset();
});

describe('Phase 200 — createBooking contract pricing', () => {
  it('applies the contract agreed_rate, skips surge, and stamps account + contract', async () => {
    // subcategory SELECT (catalog base price 50000 — should be overridden)
    dbQueryMock.mockResolvedValueOnce({ rows: [{ base_price: '50000', pricing_type: 'fixed' }], rowCount: 1 });
    businessMock.resolveBookingContract.mockResolvedValueOnce({ contractId: 'k-1', agreedRate: 99900 });
    const cap = mockInsertCapture();

    const booking = await createBooking({ ...BASE, businessAccountId: 'ba-1' });

    expect(booking.id).toBe('booking-1');
    // service_price (param index 12) = agreed_rate, NOT the catalog 50000.
    expect(cap.params[12]).toBe(99900);
    // business_account_id (20) + contract_id (21) stamped.
    expect(cap.params[20]).toBe('ba-1');
    expect(cap.params[21]).toBe('k-1');
    // Surge pricing was skipped for the contract booking.
    expect(pricingMock.calculatePricing).not.toHaveBeenCalled();
  });

  it('leaves normal bookings unchanged when no businessAccountId is passed', async () => {
    dbQueryMock.mockResolvedValueOnce({ rows: [{ base_price: '50000', pricing_type: 'fixed' }], rowCount: 1 });
    const cap = mockInsertCapture();

    await createBooking({ ...BASE });

    expect(businessMock.resolveBookingContract).not.toHaveBeenCalled();
    expect(cap.params[12]).toBe(50000); // catalog price
    expect(cap.params[20]).toBeNull();  // business_account_id
    expect(cap.params[21]).toBeNull();  // contract_id
    expect(pricingMock.calculatePricing).toHaveBeenCalled(); // surge runs normally
  });
});
