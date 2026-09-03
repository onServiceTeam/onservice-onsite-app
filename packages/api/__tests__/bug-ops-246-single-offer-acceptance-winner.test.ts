const appendProviderTermsMock = jest.fn();

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('../src/services/matching.service', () => ({}));
jest.mock('../src/services/notification.service', () => ({}));
jest.mock('../src/services/booking-financial-terms.service', () => ({
  appendProviderAssignmentTermsInTransaction: (...args: unknown[]) => appendProviderTermsMock(...args),
}));

const queryMock = jest.fn();
jest.mock('../src/models/db', () => ({
  db: {
    query: jest.fn(),
    transaction: (callback: (client: { query: typeof queryMock }) => unknown) => callback({ query: queryMock }),
  },
}));

import { acceptOffer } from '../src/services/booking-offer.service';

it('Bug OPS-246 — competing offer acceptances serialize on the booking and only one provider wins', async () => {
  // Keep the offer unambiguously live regardless of the calendar date on
  // which CI executes this concurrency regression. The previous 2026-09-02
  // fixture became expired during the 2026-09-02 run itself and exercised
  // the production expiry branch instead of the acceptance race.
  const future = new Date('2099-01-01T00:00:00.000Z');
  const offers = new Map([
    ['offer-1', { id: 'offer-1', booking_id: 'booking-1', provider_id: 'provider-1', provider_user_id: 'user-1', status: 'pending', expires_at: future }],
    ['offer-2', { id: 'offer-2', booking_id: 'booking-1', provider_id: 'provider-2', provider_user_id: 'user-2', status: 'pending', expires_at: future }],
  ]);
  const booking = { provider_id: null as string | null, status: 'paid' };
  const calls: string[] = [];

  queryMock.mockImplementation(async (sql: string, params: unknown[] = []) => {
    calls.push(sql);
    if (sql.includes('SELECT booking_id FROM booking_offers')) {
      const offer = offers.get(String(params[0]));
      return { rows: offer ? [{ booking_id: offer.booking_id }] : [], rowCount: offer ? 1 : 0 };
    }
    if (sql.includes('SELECT provider_id, status FROM bookings')) {
      return { rows: [{ ...booking }], rowCount: 1 };
    }
    if (sql.includes('SELECT bo.*')) {
      const offer = offers.get(String(params[0]));
      return { rows: offer ? [{ ...offer }] : [], rowCount: offer ? 1 : 0 };
    }
    if (sql.includes("SET status='accepted'")) {
      offers.get(String(params[0]))!.status = 'accepted';
      return { rows: [], rowCount: 1 };
    }
    if (sql.includes("SET status='cancelled'")) {
      for (const offer of offers.values()) {
        if (offer.booking_id === params[0] && offer.id !== params[1] && offer.status === 'pending') {
          offer.status = 'cancelled';
        }
      }
      return { rows: [], rowCount: 1 };
    }
    if (sql.includes('UPDATE bookings')) {
      booking.provider_id = String(params[0]);
      return { rows: [], rowCount: 1 };
    }
    throw new Error(`Unexpected query: ${sql}`);
  });

  await expect(acceptOffer('offer-1', 'user-1')).resolves.toEqual({
    booking_id: 'booking-1',
    provider_id: 'provider-1',
  });
  await expect(acceptOffer('offer-2', 'user-2')).rejects.toMatchObject({ statusCode: 409 });

  expect(booking.provider_id).toBe('provider-1');
  expect(appendProviderTermsMock).toHaveBeenCalledTimes(1);
  const bookingLockIndex = calls.findIndex((sql) => sql.includes('FROM bookings') && sql.includes('FOR UPDATE'));
  const offerLockIndex = calls.findIndex((sql) => sql.includes('FOR UPDATE OF bo'));
  expect(bookingLockIndex).toBeGreaterThan(-1);
  expect(offerLockIndex).toBeGreaterThan(bookingLockIndex);
});
