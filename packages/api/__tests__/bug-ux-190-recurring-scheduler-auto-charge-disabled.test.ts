const dbQueryMock = jest.fn();
const createNotificationMock = jest.fn().mockResolvedValue(undefined);
const attemptAutoChargeMock = jest.fn();
jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => dbQueryMock(...args), transaction: jest.fn() },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('../src/services/notification.service', () => ({
  createPushNotification: (...args: unknown[]) => createNotificationMock(...args),
}));
jest.mock('../src/services/recurring-auto-charge.service', () => ({
  attemptAutoCharge: (...args: unknown[]) => attemptAutoChargeMock(...args),
}));

// Updated 2026-10-18 (customer review slice P2 fix round, D41 Q39): the daily worker now makes no booking from a series while request-first booking is on (CR-400).
// This test pins the recurring path that still runs while that switch is off, so it reads as off.
jest.mock('../src/services/settings.service', () => ({
  isFixedPriceBookingRetired: jest.fn().mockResolvedValue(false),
}));
import { processRecurringBookings } from '../src/services/recurring.service';

it('BUG-UX-190 — the recurring scheduler creates a manual-payment booking without entering auto-charge', async () => {
  const due = {
    id: 'series-1', customer_id: 'customer-1', provider_id: 'provider-1',
    category_id: 'category-1', subcategory_id: 'subcategory-1',
    next_booking_date: '2026-08-25', preferred_time: '09:00',
    frequency: 'weekly', preferred_day: 2,
    address: '1 Service Road', barangay: 'Lahug', city: 'Cebu City', province: 'Cebu',
    latitude: null, longitude: null,
    service_price: 50000, service_fee: 5000, total_amount: 55000,
    auto_charge: true,
  };
  dbQueryMock
    .mockResolvedValueOnce({ rows: [due], rowCount: 1 })
    .mockResolvedValueOnce({ rows: [{ id: 'instance-1' }], rowCount: 1 })
    .mockResolvedValueOnce({ rows: [{ name: 'Cleaning' }], rowCount: 1 })
    .mockResolvedValueOnce({ rows: [{ id: 'booking-1' }], rowCount: 1 })
    .mockResolvedValueOnce({ rows: [], rowCount: 1 })
    .mockResolvedValueOnce({ rows: [], rowCount: 1 });

  await expect(processRecurringBookings()).resolves.toBe(1);
  expect(attemptAutoChargeMock).not.toHaveBeenCalled();
  expect(createNotificationMock).toHaveBeenCalledWith(expect.objectContaining({
    userId: 'customer-1',
    body: expect.stringMatching(/pay manually/i),
  }));
});
