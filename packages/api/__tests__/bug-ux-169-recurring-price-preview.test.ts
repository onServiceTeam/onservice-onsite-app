const queryMock = jest.fn();
const calculateServiceFeeMock = jest.fn();

jest.mock('../src/models/db', () => ({ db: { query: (...args: unknown[]) => queryMock(...args), transaction: jest.fn() } }));
jest.mock('../src/utils/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } }));
jest.mock('../src/services/notification.service', () => ({ createPushNotification: jest.fn() }));
jest.mock('../src/services/recurring-auto-charge.service', () => ({ attemptAutoCharge: jest.fn() }));
jest.mock('../src/services/booking.service', () => ({ calculateServiceFee: (...args: unknown[]) => calculateServiceFeeMock(...args) }));

import { getRecurringPricePreview } from '../src/services/recurring.service';

it('BUG-UX-169 — recurring price preview uses the active catalog price and live service fee', async () => {
  queryMock.mockResolvedValueOnce({ rows: [{ category_id: 'category-1', base_price: '50000', pricing_type: 'fixed' }] });
  calculateServiceFeeMock.mockResolvedValueOnce(5000);

  await expect(getRecurringPricePreview('subcategory-1')).resolves.toEqual({
    categoryId: 'category-1',
    subcategoryId: 'subcategory-1',
    servicePrice: 50000,
    serviceFee: 5000,
    totalAmount: 55000,
  });
  expect(calculateServiceFeeMock).toHaveBeenCalledWith(50000);
});
