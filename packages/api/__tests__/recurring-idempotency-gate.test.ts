// Audit fix — processRecurringBookings claims a recurring_instances row per
// (series, scheduled_date) BEFORE creating a booking. If the claim hits the
// unique key (ON CONFLICT DO NOTHING → 0 rows), the cycle was already handled
// and we must skip — no second booking, no second charge.

const dbQueryMock = jest.fn();
jest.mock('../src/models/db', () => ({
  db: { query: (...a: unknown[]) => dbQueryMock(...a), transaction: jest.fn() },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
const createNotificationMock = jest.fn().mockResolvedValue(undefined);
jest.mock('../src/services/notification.service', () => ({
  createPushNotification: (...a: unknown[]) => createNotificationMock(...a),
}));
const attemptAutoChargeMock = jest.fn();
jest.mock('../src/services/recurring-auto-charge.service', () => ({
  attemptAutoCharge: (...a: unknown[]) => attemptAutoChargeMock(...a),
}));

import { processRecurringBookings } from '../src/services/recurring.service';

function dueRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'rb1', customer_id: 'c1', provider_id: 'p1',
    category_id: 'cat1', subcategory_id: 'sub1',
    next_booking_date: '2026-06-10', preferred_time: '09:00',
    frequency: 'weekly', preferred_day: 3,
    address: '1 St', barangay: 'B', city: 'Cebu City', province: 'Cebu',
    latitude: 10.3, longitude: 123.9,
    service_price: 50000, service_fee: 5000, total_amount: 55000,
    auto_charge: false,
    ...overrides,
  };
}

beforeEach(() => {
  dbQueryMock.mockReset();
  createNotificationMock.mockClear();
  attemptAutoChargeMock.mockReset();
});

describe('processRecurringBookings — instance idempotency gate', () => {
  it('skips the cycle when the instance is already claimed (ON CONFLICT → 0 rows)', async () => {
    dbQueryMock
      .mockResolvedValueOnce({ rows: [dueRow()], rowCount: 1 })   // SELECT due series
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });          // claim INSERT → conflict

    const created = await processRecurringBookings();

    expect(created).toBe(0);
    // Only the SELECT + the claim ran — no booking INSERT, no charge.
    expect(dbQueryMock).toHaveBeenCalledTimes(2);
    expect(attemptAutoChargeMock).not.toHaveBeenCalled();
  });

  it('processes the cycle when the claim succeeds', async () => {
    dbQueryMock
      .mockResolvedValueOnce({ rows: [dueRow()], rowCount: 1 })          // SELECT due
      .mockResolvedValueOnce({ rows: [{ id: 'inst1' }], rowCount: 1 })   // claim INSERT
      .mockResolvedValueOnce({ rows: [{ name: 'Cleaning' }], rowCount: 1 }) // category SELECT
      .mockResolvedValueOnce({ rows: [{ id: 'bk1' }], rowCount: 1 })     // booking INSERT
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })                  // UPDATE instance -> created
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });                 // UPDATE advance next_booking_date

    const created = await processRecurringBookings();

    expect(created).toBe(1);
    // The instance was claimed before the booking was inserted.
    const sqls = dbQueryMock.mock.calls.map((c) => String(c[0]));
    expect(sqls[1]).toMatch(/INSERT INTO recurring_instances[\s\S]*ON CONFLICT/i);
    expect(sqls[3]).toMatch(/INSERT INTO bookings/i);
    expect(sqls[4]).toMatch(/UPDATE recurring_instances SET booking_id/i);
    // auto_charge=false → no charge, generic notification fired.
    expect(attemptAutoChargeMock).not.toHaveBeenCalled();
    expect(createNotificationMock).toHaveBeenCalled();
  });
});
