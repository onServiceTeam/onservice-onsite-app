// CR-266 (customer review 2026-10-17, slice P2, finish-path-7/8; D41 Q39
// option a): with request-first booking switched off in admin, a fixed-price
// booking is created exactly as before (the refusal of CR-265 applies only
// while the switch is on). The real createBooking and the real settings
// service run; the database answers are synthetic: the request_first_booking
// row says 'false', the catalog price is 40,000 centavos and the insert
// returns the new booking. The same database edges as Bug OPS-281.
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
jest.mock('../src/services/slot-waitlist.service', () => ({ markWaitlistAsBooked: jest.fn() }));
jest.mock('../src/services/socket.service', () => ({ emitAdminEvent: jest.fn(), ADMIN_EVENTS: { BOOKING_CREATED: 'booking:created' } }));
jest.mock('../src/services/booking-financial-terms.service', () => ({
  appendPricingTermsInTransaction: jest.fn().mockResolvedValue({ id: 'terms-cr-266' }),
}));

import { createBooking } from '../src/services/booking.service';

it('Bug CR-266 — with request-first booking off, a fixed-price booking is created as before', async () => {
  const switchReads: unknown[] = [];
  queryMock.mockImplementation(async (sql: string, params?: unknown[]) => {
    if (sql.includes("key = 'request_first_booking'")) {
      switchReads.push(params);
      return { rows: [{ value: 'false', recently_saved: false }], rowCount: 1 };
    }
    if (sql.includes('FROM service_subcategories WHERE id = $1')) {
      return { rows: [{ base_price: '40000', pricing_type: 'fixed', hourly_rate: null }], rowCount: 1 };
    }
    // Fee settings: none stored, so the in-code defaults (no customer fee) apply.
    if (sql.includes('FROM platform_settings WHERE key = $1')) return { rows: [], rowCount: 0 };
    throw new Error(`Unexpected query: ${sql}`);
  });
  const client = {
    query: jest.fn(async (sql: string) => {
      if (/INSERT INTO bookings/.test(sql)) return { rows: [{
        id: 'booking-cr-266', customer_id: 'customer-cr-266', provider_id: null,
        status: 'requested', service_price: 40000, service_fee: 0, total_amount: 40000,
      }], rowCount: 1 };
      throw new Error(`Unexpected transaction query: ${sql}`);
    }),
  };
  transactionMock.mockImplementation(async (callback: (tx: typeof client) => Promise<unknown>) => callback(client));

  const booking = await createBooking({
    customerId: 'customer-cr-266', categoryId: 'category-1', subcategoryId: 'subcategory-1',
    bookingType: 'fixed_price', description: 'Deep clean of a two-bedroom condo unit.',
    address: 'Unit 12B, Mango Square Residences', barangay: 'Lahug', city: 'Cebu City', province: 'Cebu',
    latitude: 10.3317, longitude: 123.8977, scheduledAt: '2026-11-02T02:00:00.000Z',
  });

  expect(switchReads).toHaveLength(1);
  expect(booking).toMatchObject({ id: 'booking-cr-266', status: 'requested', total_amount: 40000 });
  expect(client.query).toHaveBeenCalledWith(expect.stringMatching(/INSERT INTO bookings/), expect.arrayContaining(['fixed_price', 40000]));
});
