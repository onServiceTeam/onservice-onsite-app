const queryMock = jest.fn();
const calculateServiceFeeMock = jest.fn().mockResolvedValue(5000);

jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => queryMock(...args), transaction: jest.fn() },
}));
jest.mock('../src/utils/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } }));
jest.mock('../src/services/notification.service', () => ({ createPushNotification: jest.fn() }));
jest.mock('../src/services/booking.service', () => ({
  calculateServiceFee: (...args: unknown[]) => calculateServiceFeeMock(...args),
}));

import { createRecurringBooking } from '../src/services/recurring.service';

it('Bug SEC-021 — recurring creation rejects a source booking that is not owned by the authenticated customer', async () => {
  queryMock
    .mockResolvedValueOnce({ rows: [{ category_id: 'category-1', base_price: '50000', pricing_type: 'fixed' }] })
    .mockResolvedValueOnce({ rows: [] });

  await expect(createRecurringBooking({
    customerId: 'customer-1',
    providerId: 'provider-1',
    categoryId: 'category-1',
    subcategoryId: 'subcategory-1',
    originalBookingId: 'another-customers-booking',
    frequency: 'weekly',
    preferredDay: 2,
    preferredTime: '09:00',
    address: '1 Test Street',
    barangay: 'Lahug',
    city: 'Cebu City',
    province: 'Cebu',
  })).rejects.toMatchObject({ statusCode: 404, message: 'Eligible source booking not found.' });

  expect(queryMock).toHaveBeenCalledTimes(2);
});
