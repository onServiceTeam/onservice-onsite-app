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

it('Bug UX-255 — quote admission enforces the live maximum-per-booking setting', async () => {
  getQuotePolicyMock.mockResolvedValueOnce({ expiryHours: 48, maxPerBooking: 2 });
  clientQueryMock
    .mockResolvedValueOnce({ rows: [{ id: 'provider-1' }] })
    .mockResolvedValueOnce({ rows: [{
      id: 'booking-1', booking_type: 'quote_based', status: 'quoted',
      category_id: 'category-1', latitude: null, longitude: null,
    }] })
    .mockResolvedValueOnce({ rows: [{ eligible: true }] })
    .mockResolvedValueOnce({ rows: [{ count: '0' }] })
    .mockResolvedValueOnce({ rows: [{ count: '2' }] });

  await expect(
    submitQuote('booking-1', 'provider-user-1', 100_000, 'Quoted repair'),
  ).rejects.toMatchObject({ statusCode: 409, message: expect.stringMatching(/maximum of 2 quotes/) });
  expect(getQuotePolicyMock).toHaveBeenCalledTimes(1);
  expect(clientQueryMock.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO booking_quotes'))).toBe(false);
});
