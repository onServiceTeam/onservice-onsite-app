// Phase 200 — getChangeOrders must return the marginal service fee + total.
//
// The customer "pay additional amount" screen re-opens an already-approved
// change order to pay it. Pre-fix the list endpoint returned only
// additionalAmount, so the re-pay screen showed no total and silently
// bypassed the wallet-balance gate. getChangeOrders now computes
// additionalServiceFee + additionalTotal from the booking's current baseline
// (same math as respondToChangeOrder).

const dbQueryMock = jest.fn();
jest.mock('../src/models/db', () => ({
  db: { query: (...a: unknown[]) => dbQueryMock(...a) },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('../src/services/settings.service', () => ({
  getSettingPercent: jest.fn().mockResolvedValue(0.1), // 10% service fee
  getSettingNumber: jest.fn().mockImplementation((key: string) => {
    if (key === 'service_fee_min') return Promise.resolve(2500);
    if (key === 'service_fee_max') return Promise.resolve(50000);
    return Promise.resolve(0);
  }),
}));

import { getChangeOrders } from '../src/services/booking.service';

const BOOKING_ID = 'booking-1';

beforeEach(() => {
  dbQueryMock.mockReset();
});

describe('Phase 200 — getChangeOrders returns marginal fee + total', () => {
  it('computes additionalServiceFee and additionalTotal from the booking baseline', async () => {
    // 1st query: change_orders for the booking.
    dbQueryMock.mockResolvedValueOnce({
      rows: [{
        id: 'co-1', booking_id: BOOKING_ID, provider_id: 'prov-1',
        description: 'Extra deep-clean of oven', additional_amount: 50000,
        photos: ['https://s3/justify-1.jpg'], status: 'approved',
        customer_responded_at: null, created_at: new Date('2026-05-01'),
      }],
    });
    // 2nd query: booking baseline (₱1000 service + ₱100 fee = ₱1100 total).
    dbQueryMock.mockResolvedValueOnce({
      rows: [{ service_price: 100000, total_amount: 110000 }],
    });

    const orders = await getChangeOrders(BOOKING_ID);

    expect(orders).toHaveLength(1);
    const co = orders[0]!;
    expect(co.additionalAmount).toBe(50000);
    // newServicePrice 150000 → fee 15000 → newTotal 165000.
    // additionalTotal = 165000 - 110000 = 55000.
    // additionalServiceFee = 55000 - 50000 = 5000.
    expect(co.additionalServiceFee).toBe(5000);
    expect(co.additionalTotal).toBe(55000);
    // Real photo URLs are preserved (rendered as images on the client).
    expect(co.photos).toEqual(['https://s3/justify-1.jpg']);
  });

  it('leaves fee/total null when the parent booking cannot be read', async () => {
    dbQueryMock.mockResolvedValueOnce({
      rows: [{
        id: 'co-2', booking_id: BOOKING_ID, provider_id: 'prov-1',
        description: 'x', additional_amount: 30000, photos: [], status: 'approved',
        customer_responded_at: null, created_at: new Date('2026-05-01'),
      }],
    });
    dbQueryMock.mockResolvedValueOnce({ rows: [] }); // booking missing

    const orders = await getChangeOrders(BOOKING_ID);
    expect(orders[0]!.additionalServiceFee).toBeNull();
    expect(orders[0]!.additionalTotal).toBeNull();
  });
});
