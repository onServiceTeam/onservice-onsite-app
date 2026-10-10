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

it('Bug SEC-021 — recurring creation requires an owned, completed, fixed-price source booking for the same service', async () => {
  const params = {
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
  } as const;
  const pricingRow = { category_id: 'category-1', base_price: '50000', pricing_type: 'fixed' };
  const eligibleSource = {
    customer_id: 'customer-1',
    category_id: 'category-1',
    subcategory_id: 'subcategory-1',
    booking_type: 'fixed_price',
    status: 'confirmed',
  };

  queryMock
    .mockResolvedValueOnce({ rows: [pricingRow] })
    .mockResolvedValueOnce({ rows: [] });
  await expect(createRecurringBooking(params))
    .rejects.toMatchObject({ statusCode: 404, message: 'Eligible source booking not found.' });

  queryMock
    .mockResolvedValueOnce({ rows: [pricingRow] })
    .mockResolvedValueOnce({ rows: [{ ...eligibleSource, status: 'in_progress' }] });
  await expect(createRecurringBooking(params))
    .rejects.toMatchObject({ statusCode: 409, message: 'Recurring setup requires a customer-confirmed completed booking.' });

  queryMock
    .mockResolvedValueOnce({ rows: [pricingRow] })
    .mockResolvedValueOnce({ rows: [{ ...eligibleSource, booking_type: 'hourly' }] });
  await expect(createRecurringBooking(params))
    .rejects.toMatchObject({ statusCode: 409, message: 'Only completed fixed-price bookings can become recurring.' });

  queryMock
    .mockResolvedValueOnce({ rows: [pricingRow] })
    .mockResolvedValueOnce({ rows: [{ ...eligibleSource, subcategory_id: 'another-subcategory' }] });
  await expect(createRecurringBooking(params))
    .rejects.toMatchObject({ statusCode: 409, message: 'Recurring service must match the completed source booking.' });

  expect(queryMock).toHaveBeenCalledTimes(8);
  expect(queryMock.mock.calls.filter(([sql]) => String(sql).includes('FROM bookings')))
    .toHaveLength(4);
});
