const dbTransactionMock = jest.fn();
jest.mock('../src/models/db', () => ({
  db: { query: jest.fn(), transaction: (cb: unknown) => dbTransactionMock(cb) },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { reassignBookingProvider } from '../src/services/booking-admin.service';

it('Bug UX-486 — admin reassignment rejects a booking outside the provider service radius even when a crafted request bypasses the picker', async () => {
  dbTransactionMock.mockImplementationOnce(async (callback: (client: { query: jest.Mock }) => unknown) => callback({
    query: jest.fn(async (sql: string) => {
      if (sql.includes('FROM bookings WHERE id = $1 FOR UPDATE')) {
        return { rows: [{
          id: 'booking-1', status: 'requested', provider_id: null, category_id: 'cat-1',
          subcategory_id: null, latitude: '10.3157', longitude: '123.8854',
        }], rowCount: 1 };
      }
      return { rows: [{
        id: 'provider-1', user_id: 'provider-user-1', status: 'approved', is_active: true,
        is_available: true, service_eligible: true, in_range: false,
      }], rowCount: 1 };
    }),
  }));

  await expect(reassignBookingProvider('booking-1', 'provider-1', 'Support verified reassignment', 'admin-1'))
    .rejects.toMatchObject({ statusCode: 409, message: "Booking is outside the new provider's service radius." });
});
