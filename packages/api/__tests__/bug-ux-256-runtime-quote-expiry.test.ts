const clientQueryMock = jest.fn();
const getQuotePolicyMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: {
    query: jest.fn(),
    transaction: (callback: (client: { query: typeof clientQueryMock }) => unknown) => callback({ query: clientQueryMock }),
  },
}));
jest.mock('../src/services/settings.service', () => ({
  getQuotePolicy: (...args: unknown[]) => getQuotePolicyMock(...args),
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { submitQuote } from '../src/services/booking.service';

it('Bug UX-256 — a submitted quote expires using the live admin duration', async () => {
  jest.useFakeTimers().setSystemTime(new Date('2026-08-24T00:00:00.000Z'));
  getQuotePolicyMock.mockResolvedValueOnce({ expiryHours: 36, maxPerBooking: 5 });
  clientQueryMock
    .mockResolvedValueOnce({ rows: [{ id: 'provider-1' }] })
    .mockResolvedValueOnce({ rows: [{
      id: 'booking-1', booking_type: 'quote_based', status: 'quoted',
      category_id: 'category-1', latitude: null, longitude: null,
    }] })
    .mockResolvedValueOnce({ rows: [{ eligible: true }] })
    .mockResolvedValueOnce({ rows: [{ count: '0' }] })
    .mockResolvedValueOnce({ rows: [{ count: '1' }] })
    .mockResolvedValueOnce({ rows: [{
      id: 'quote-1', booking_id: 'booking-1', provider_id: 'provider-1',
      quoted_price: 100_000, description: 'Quoted repair',
    }] });

  await submitQuote('booking-1', 'provider-user-1', 100_000, 'Quoted repair');

  const insertCall = clientQueryMock.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO booking_quotes'));
  expect(insertCall?.[1]?.[5]).toEqual(new Date('2026-08-25T12:00:00.000Z'));
  jest.useRealTimers();
});
