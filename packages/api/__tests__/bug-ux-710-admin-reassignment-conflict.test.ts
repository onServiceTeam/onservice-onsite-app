const dbQueryMock = jest.fn();
const dbTransactionMock = jest.fn();
const conflictMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: {
    query: (...args: unknown[]) => dbQueryMock(...args),
    transaction: (callback: unknown) => dbTransactionMock(callback),
  },
}));
jest.mock('../src/services/matching.service', () => ({
  hasBookingConflict: (...args: unknown[]) => conflictMock(...args),
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { reassignBookingProvider } from '../src/services/booking-admin.service';

it('Bug UX-710 — admin reassignment rejects a provider with an overlapping scheduled booking', async () => {
  const scheduledAt = new Date('2026-09-01T02:00:00.000Z');
  dbTransactionMock.mockImplementationOnce(async (callback: (client: { query: jest.Mock }) => unknown) => callback({
    query: jest.fn(async (sql: string) => {
      if (sql.includes('FROM bookings WHERE id = $1 FOR UPDATE')) {
        return { rows: [{
          id: 'booking-1', status: 'requested', customer_id: 'customer-1', provider_id: null,
          performer_staff_id: null, old_provider_user_id: null, category_id: 'category-1',
          subcategory_id: null, latitude: '10.3157', longitude: '123.8854', scheduled_at: scheduledAt,
        }], rowCount: 1 };
      }
      return { rows: [{
        id: 'provider-1', user_id: 'provider-user-1', status: 'approved', is_active: true,
        is_available: true, service_eligible: true, in_range: true,
      }], rowCount: 1 };
    }),
  }));
  conflictMock.mockResolvedValueOnce(true);

  await expect(reassignBookingProvider(
    'booking-1',
    'provider-1',
    'Support verified the replacement provider.',
    'admin-1',
  )).rejects.toMatchObject({
    statusCode: 409,
    message: 'New provider already has an overlapping booking. Choose another provider or reschedule the job.',
  });
  expect(conflictMock).toHaveBeenCalledWith('provider-1', scheduledAt, undefined, 'booking-1');
});
