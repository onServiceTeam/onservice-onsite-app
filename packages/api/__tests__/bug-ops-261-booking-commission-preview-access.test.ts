const queryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: {
    transaction: (callback: (client: { query: typeof queryMock }) => unknown) => callback({ query: queryMock }),
  },
}));

import { getBookingCommissionPreview } from '../src/services/booking-financial-terms.service';

it('Bug OPS-261 — booking commission preview hides bookings unrelated to the authenticated provider', async () => {
  queryMock
    .mockResolvedValueOnce({ rows: [{
      id: 'booking-other', provider_id: 'provider-other', category_id: 'category-1', subcategory_id: null,
      status: 'paid', escrow_status: 'held', service_price: '100000', service_fee: '10000', total_amount: '110000',
    }], rowCount: 1 })
    .mockResolvedValueOnce({ rows: [{ allowed: false }], rowCount: 1 });

  await expect(getBookingCommissionPreview('provider-requesting', 'booking-other')).rejects.toMatchObject({
    statusCode: 404,
    message: 'Booking not found.',
  });

  expect(queryMock).toHaveBeenCalledTimes(2);
  const accessSql = String(queryMock.mock.calls[1]?.[0]);
  expect(accessSql).toContain('booking_offers');
  expect(accessSql).toContain('booking_quotes');
  expect(accessSql).toContain('provider_services');
});
