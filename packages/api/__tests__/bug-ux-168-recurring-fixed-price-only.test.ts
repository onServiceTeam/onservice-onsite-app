const queryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => queryMock(...args), transaction: jest.fn() },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('../src/services/notification.service', () => ({ createPushNotification: jest.fn() }));
jest.mock('../src/services/recurring-auto-charge.service', () => ({ attemptAutoCharge: jest.fn() }));
jest.mock('../src/services/booking.service', () => ({ calculateServiceFee: jest.fn() }));

import { createRecurringBooking } from '../src/services/recurring.service';

it('BUG-UX-168 — recurring creation rejects per-unit services even when a base price is present', async () => {
  queryMock.mockResolvedValueOnce({ rows: [{ base_price: '50000', pricing_type: 'per_unit' }] });

  await expect(createRecurringBooking({
    customerId: 'customer-1',
    categoryId: 'category-1',
    subcategoryId: 'subcategory-1',
    frequency: 'weekly',
    preferredDay: 2,
    preferredTime: '09:00',
    address: '1 Test Street',
    barangay: 'Lahug',
    city: 'Cebu City',
    province: 'Cebu',
  })).rejects.toThrow('Only fixed-price services can be set as recurring bookings.');

  expect(queryMock).toHaveBeenCalledTimes(1);
});
