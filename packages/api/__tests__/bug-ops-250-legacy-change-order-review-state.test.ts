const dbQueryMock = jest.fn();
const getLatestTermsOrNullMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => dbQueryMock(...args) },
}));
jest.mock('../src/services/booking-financial-terms.service', () => ({
  getLatestTermsOrNull: (...args: unknown[]) => getLatestTermsOrNullMock(...args),
  calculateServiceFeeFromTerms: jest.fn(),
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { getChangeOrders } from '../src/services/booking.service';

it('Bug OPS-250 — legacy change orders remain readable but payment is flagged for terms review', async () => {
  dbQueryMock
    .mockResolvedValueOnce({ rows: [{
      id: 'change-1', booking_id: 'booking-1', provider_id: 'provider-1',
      description: 'Additional materials', additional_amount: 50000,
      photos: [], status: 'approved', customer_responded_at: new Date(), created_at: new Date(),
    }] })
    .mockResolvedValueOnce({ rows: [] })
    .mockResolvedValueOnce({ rows: [{ service_price: 100000, total_amount: 110000 }] });
  getLatestTermsOrNullMock.mockResolvedValueOnce(null);

  await expect(getChangeOrders('booking-1')).resolves.toEqual([
    expect.objectContaining({
      id: 'change-1',
      additionalServiceFee: null,
      additionalTotal: null,
      financialTermsReviewRequired: true,
    }),
  ]);
});
