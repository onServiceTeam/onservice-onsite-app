const queryMock = jest.fn();
const calculateServiceFeeMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => queryMock(...args), transaction: jest.fn() },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('../src/services/notification.service', () => ({ createPushNotification: jest.fn() }));
jest.mock('../src/services/booking.service', () => ({
  calculateServiceFee: (...args: unknown[]) => calculateServiceFeeMock(...args),
}));

import { createRecurringBooking } from '../src/services/recurring.service';

it('BUG-UX-196 — recurring creation explicitly stores automatic charging disabled', async () => {
  queryMock
    .mockResolvedValueOnce({
      rows: [{ category_id: 'category-1', base_price: '50000', pricing_type: 'fixed' }],
    })
    .mockResolvedValueOnce({
      rows: [{
        customer_id: 'customer-1', category_id: 'category-1', subcategory_id: 'subcategory-1',
        booking_type: 'fixed_price', status: 'confirmed',
      }],
    })
    .mockResolvedValueOnce({
      rows: [{ id: 'recurring-1', customer_id: 'customer-1', auto_charge: false }],
    });
  calculateServiceFeeMock.mockResolvedValueOnce(5000);

  await createRecurringBooking({
    customerId: 'customer-1',
    categoryId: 'category-1',
    subcategoryId: 'subcategory-1',
    originalBookingId: 'booking-1',
    frequency: 'weekly',
    preferredDay: 2,
    preferredTime: '09:00',
    address: '1 Test Street',
    barangay: 'Lahug',
    city: 'Cebu City',
    province: 'Cebu',
  });

  const [insertSql, insertParams] = queryMock.mock.calls[2] as [string, unknown[]];
  expect(insertSql).toMatch(/next_booking_date, auto_charge/);
  expect(insertParams.at(-1)).toBe(false);
});
