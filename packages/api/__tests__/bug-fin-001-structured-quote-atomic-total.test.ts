const dbQueryMock = jest.fn();
const dbTransactionMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: {
    query: (...args: unknown[]) => dbQueryMock(...args),
    transaction: (callback: unknown) => dbTransactionMock(callback),
  },
}));

jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('../src/services/settings.service', () => ({
  getQuotePolicy: jest.fn(async () => ({ expiryHours: 48, maxPerBooking: 5 })),
}));

import { submitStructuredQuote } from '../src/services/booking.service';

it('Bug FIN-001 — itemized quote stores the line-item total and every write shares one transaction', async () => {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  dbTransactionMock.mockImplementationOnce(async (callback: unknown) => {
    const query = jest.fn(async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      if (/SELECT id FROM providers/.test(sql)) {
        return { rows: [{ id: 'provider-1' }], rowCount: 1 };
      }
      if (/SELECT \* FROM bookings.*FOR UPDATE/s.test(sql)) {
        return {
          rows: [{ id: 'booking-1', booking_type: 'quote_based', status: 'requested' }],
          rowCount: 1,
        };
      }
      if (/AS eligible/.test(sql)) {
        return { rows: [{ eligible: true }], rowCount: 1 };
      }
      if (/COUNT\(\*\).*provider_id/s.test(sql)) {
        return { rows: [{ count: '0' }], rowCount: 1 };
      }
      if (/COUNT\(\*\).*booking_quotes/s.test(sql)) {
        return { rows: [{ count: '0' }], rowCount: 1 };
      }
      if (/INSERT INTO booking_quotes/.test(sql)) {
        return {
          rows: [{
            id: 'quote-1',
            booking_id: params[0],
            provider_id: params[1],
            quoted_price: params[2],
            description: params[3],
            estimated_duration_minutes: params[4],
            expires_at: params[5],
            created_at: new Date('2026-08-24T00:00:00.000Z'),
            is_accepted: false,
          }],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 1 };
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (callback as any)({ query });
  });

  const result = await submitStructuredQuote('booking-1', 'provider-user-1', {
    quotedPrice: 999_999,
    description: 'Replace the damaged sink and reconnect the drain safely.',
    lineItems: [
      { description: 'Labor', quantity: 2, unit: 'hour', unitPrice: 10_000, itemType: 'labor' },
      { description: 'Drain parts', quantity: 1.5, unit: 'set', unitPrice: 20_000, itemType: 'materials' },
    ],
  });

  const quoteInsert = calls.find((call) => /INSERT INTO booking_quotes/.test(call.sql));
  const lineInsert = calls.find((call) => /INSERT INTO quote_line_items/.test(call.sql));
  expect(dbTransactionMock).toHaveBeenCalledTimes(1);
  expect(dbQueryMock).not.toHaveBeenCalled();
  expect(quoteInsert?.params[2]).toBe(50_000);
  expect(lineInsert).toBeDefined();
  expect(result).toMatchObject({ quoted_price: 50_000, laborAmount: 20_000, materialsAmount: 30_000 });
});
