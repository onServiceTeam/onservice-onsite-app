// CRIT-N09 fix verified — createBooking + booking_addons run inside a single
// db.transaction. Pre-fix: bookings INSERT committed, then per-addon INSERTs
// ran as separate top-level db.query calls. If any addon insert failed, the
// booking existed with an addon-inclusive total but no addon rows.

const dbQueryMock = jest.fn();
const dbTransactionMock = jest.fn();
jest.mock('../../src/models/db', () => ({
  db: {
    query: (...args: unknown[]) => dbQueryMock(...args),
    transaction: (cb: unknown) => dbTransactionMock(cb),
  },
}));

jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

const pricingMock = { calculatePricing: jest.fn() };
jest.mock('../../src/services/pricing.service', () => pricingMock);

const slotWaitlistMock = { markWaitlistAsBooked: jest.fn() };
jest.mock('../../src/services/slot-waitlist.service', () => slotWaitlistMock);

const sukiMock = { calculateSukiDiscountForBooking: jest.fn() };
jest.mock('../../src/services/suki.service', () => sukiMock);

const socketMock = {
  emitAdminEvent: jest.fn(),
  ADMIN_EVENTS: { BOOKING_CREATED: 'booking:created', BOOKING_STATUS_CHANGED: 'booking:status_changed' },
};
jest.mock('../../src/services/socket.service', () => socketMock);

const promoMock = { resolvePromo: jest.fn() };
jest.mock('../../src/services/booking/promo.service', () => promoMock);

// Phase B CRIT-13 fix — calculateServiceFee is now async and reads
// from settings.service. Mock it so the test doesn't hit Redis.
jest.mock('../../src/services/settings.service', () => ({
  getSettingPercent: jest.fn().mockResolvedValue(0.1),
  getSettingNumber: jest.fn().mockImplementation((key: string) => {
    if (key === 'service_fee_min') return Promise.resolve(2500);
    if (key === 'service_fee_max') return Promise.resolve(50000);
    return Promise.resolve(0);
  }),
}));

jest.mock('../../src/services/service-area.service', () => ({
  checkCoverage: jest.fn().mockResolvedValue({ covered: true, area: { id: 'area-1' } }),
}));

import { createBooking } from '../../src/services/booking.service';

const SUBCAT_ID = 'sub-1';
const CATEGORY_ID = 'cat-1';
const ADDON_1 = 'addon-1';
const ADDON_2 = 'addon-2';

beforeEach(() => {
  dbQueryMock.mockReset();
  dbTransactionMock.mockReset();
  pricingMock.calculatePricing.mockResolvedValue({
    surgeMultiplier: 1, surgeAmount: 0, appliedRule: null,
  });
});

function setupBookingMocks() {
  // 1. SELECT subcategory
  dbQueryMock.mockResolvedValueOnce({
    rows: [{ base_price: '50000', pricing_type: 'fixed' }],
    rowCount: 1,
  });
  // 2. SELECT addons (the addon IDs match what we send below)
  dbQueryMock.mockResolvedValueOnce({
    rows: [
      { id: ADDON_1, subcategory_id: SUBCAT_ID, price: '5000', is_active: true, name: 'Addon One' },
      { id: ADDON_2, subcategory_id: SUBCAT_ID, price: '3000', is_active: true, name: 'Addon Two' },
    ],
    rowCount: 2,
  });
}

describe('CRIT-N09 — createBooking + booking_addons run inside one transaction', () => {
  it('CRIT-N09 — happy path: booking INSERT + multi-row addon INSERT both run on trx client', async () => {
    setupBookingMocks();

    const txCalls: Array<{ sql: string; params: unknown[] }> = [];
    dbTransactionMock.mockImplementationOnce(async (cb: unknown) => {
      const clientQuery = jest.fn(async (sql: string, params: unknown[] = []) => {
        txCalls.push({ sql, params });
        if (/INSERT INTO bookings/.test(sql)) {
          return {
            rows: [{
              id: 'booking-1',
              customer_id: 'c-1',
              provider_id: null,
              status: 'requested',
              total_amount: 58000,
              service_price: 58000,
            }],
            rowCount: 1,
          };
        }
        if (/INSERT INTO booking_addons/.test(sql)) {
          return { rows: [], rowCount: 2 };
        }
        return { rows: [], rowCount: 0 };
      });
      return (cb as (client: { query: typeof clientQuery }) => Promise<unknown>)({ query: clientQuery });
    });

    const booking = await createBooking({
      customerId: 'c-1',
      categoryId: CATEGORY_ID,
      subcategoryId: SUBCAT_ID,
      bookingType: 'fixed_price',
      description: 'Test',
      address: '123 Test St',
      barangay: 'B',
      city: 'C',
      province: 'P',
      latitude: 10.3157,
      longitude: 123.8854,
      scheduledAt: '2026-04-15T08:00:00Z',
      addons: [
        { addonId: ADDON_1, quantity: 1 },
        { addonId: ADDON_2, quantity: 1 },
      ],
    });

    expect(booking.id).toBe('booking-1');
    expect(dbTransactionMock).toHaveBeenCalledTimes(1);
    expect(txCalls).toHaveLength(2); // 1 booking INSERT + 1 multi-row addon INSERT
    expect(txCalls[0]!.sql).toMatch(/INSERT INTO bookings/);
    expect(txCalls[1]!.sql).toMatch(/INSERT INTO booking_addons/);
    // Multi-row INSERT (CRIT-N09 perf fix): single SQL with 8 params
    // (4 cols × 2 rows).
    expect(txCalls[1]!.params).toHaveLength(8);
    expect(txCalls[1]!.params[1]).toBe(ADDON_1);
    expect(txCalls[1]!.params[5]).toBe(ADDON_2);
  });

  it('CRIT-N09 — addon insert failure rolls back booking insert (atomic)', async () => {
    setupBookingMocks();

    dbTransactionMock.mockImplementationOnce(async (cb: unknown) => {
      const clientQuery = jest.fn(async (sql: string) => {
        if (/INSERT INTO bookings/.test(sql)) {
          return {
            rows: [{
              id: 'booking-1',
              customer_id: 'c-1',
              provider_id: null,
              status: 'requested',
              total_amount: 58000,
              service_price: 58000,
            }],
            rowCount: 1,
          };
        }
        if (/INSERT INTO booking_addons/.test(sql)) {
          throw new Error('addon insert failed (FK violation)');
        }
        return { rows: [], rowCount: 0 };
      });
      // The real db.transaction rolls back on throw.
      return await (cb as (client: { query: typeof clientQuery }) => Promise<unknown>)({ query: clientQuery });
    });

    await expect(createBooking({
      customerId: 'c-1',
      categoryId: CATEGORY_ID,
      subcategoryId: SUBCAT_ID,
      bookingType: 'fixed_price',
      description: 'Test',
      address: '123 Test St',
      barangay: 'B',
      city: 'C',
      province: 'P',
      latitude: 10.3157,
      longitude: 123.8854,
      scheduledAt: '2026-04-15T08:00:00Z',
      addons: [{ addonId: ADDON_1, quantity: 1 }],
    })).rejects.toThrow(/addon insert failed/);

    // Trx was opened exactly once. Real wrapper rolls back booking
    // INSERT on the throw.
    expect(dbTransactionMock).toHaveBeenCalledTimes(1);
  });

  it('CRIT-N09 — booking with no addons still uses transaction (only booking insert)', async () => {
    // 1. SELECT subcategory
    dbQueryMock.mockResolvedValueOnce({
      rows: [{ base_price: '50000', pricing_type: 'fixed' }],
      rowCount: 1,
    });
    // No addon SELECT — addons array is empty.

    const txCalls: Array<{ sql: string; params: unknown[] }> = [];
    dbTransactionMock.mockImplementationOnce(async (cb: unknown) => {
      const clientQuery = jest.fn(async (sql: string, params: unknown[] = []) => {
        txCalls.push({ sql, params });
        if (/INSERT INTO bookings/.test(sql)) {
          return {
            rows: [{
              id: 'booking-1',
              customer_id: 'c-1',
              provider_id: null,
              status: 'requested',
              total_amount: 50000,
              service_price: 50000,
            }],
            rowCount: 1,
          };
        }
        return { rows: [], rowCount: 0 };
      });
      return (cb as (client: { query: typeof clientQuery }) => Promise<unknown>)({ query: clientQuery });
    });

    const booking = await createBooking({
      customerId: 'c-1',
      categoryId: CATEGORY_ID,
      subcategoryId: SUBCAT_ID,
      bookingType: 'fixed_price',
      description: 'Test',
      address: '123 Test St',
      barangay: 'B',
      city: 'C',
      province: 'P',
      latitude: 10.3157,
      longitude: 123.8854,
      scheduledAt: '2026-04-15T08:00:00Z',
    });

    expect(booking.id).toBe('booking-1');
    expect(dbTransactionMock).toHaveBeenCalledTimes(1);
    // No booking_addons INSERT when addons[] is empty.
    expect(txCalls).toHaveLength(1);
    expect(txCalls[0]!.sql).toMatch(/INSERT INTO bookings/);
  });
});
