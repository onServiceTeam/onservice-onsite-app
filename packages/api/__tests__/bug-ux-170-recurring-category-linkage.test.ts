const queryMock = jest.fn();
const calculateServiceFeeMock = jest.fn();

jest.mock('../src/models/db', () => ({ db: { query: (...args: unknown[]) => queryMock(...args), transaction: jest.fn() } }));
jest.mock('../src/utils/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } }));
jest.mock('../src/services/notification.service', () => ({ createPushNotification: jest.fn() }));
jest.mock('../src/services/recurring-auto-charge.service', () => ({ attemptAutoCharge: jest.fn() }));
jest.mock('../src/services/booking.service', () => ({ calculateServiceFee: (...args: unknown[]) => calculateServiceFeeMock(...args) }));

import { createRecurringBooking } from '../src/services/recurring.service';

it('BUG-UX-170 — recurring creation rejects a category and subcategory that do not belong together', async () => {
  queryMock.mockResolvedValueOnce({ rows: [{ category_id: 'real-category', base_price: '50000', pricing_type: 'fixed' }] });
  calculateServiceFeeMock.mockResolvedValueOnce(5000);

  await expect(createRecurringBooking({
    customerId: 'customer-1', categoryId: 'wrong-category', subcategoryId: 'subcategory-1',
    frequency: 'weekly', preferredDay: 2, preferredTime: '09:00',
    address: '1 Test Street', barangay: 'Lahug', city: 'Cebu City', province: 'Cebu',
  })).rejects.toThrow('Subcategory does not belong to the selected category.');

  expect(queryMock).toHaveBeenCalledTimes(1);
});
