const dbTransactionMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: {
    query: jest.fn(),
    transaction: (callback: unknown) => dbTransactionMock(callback),
  },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { submitStructuredQuote } from '../src/services/booking.service';

it('Bug SEC-011 — an approved provider cannot quote outside their active category or service radius', async () => {
  const calls: string[] = [];
  dbTransactionMock.mockImplementationOnce(async (callback: unknown) => {
    const query = jest.fn(async (sql: string) => {
      calls.push(sql);
      if (/SELECT id FROM providers/.test(sql)) return { rows: [{ id: 'provider-1' }], rowCount: 1 };
      if (/SELECT \* FROM bookings.*FOR UPDATE/s.test(sql)) {
        return {
          rows: [{
            id: 'booking-1', booking_type: 'quote_based', status: 'requested',
            category_id: 'category-plumbing', latitude: '10.3157', longitude: '123.8854',
          }],
          rowCount: 1,
        };
      }
      if (/AS eligible/.test(sql)) return { rows: [{ eligible: false }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (callback as any)({ query });
  });

  await expect(submitStructuredQuote('booking-1', 'provider-user-1', {
    quotedPrice: 50_000,
    description: 'Replace the damaged pipe and test the repaired connection.',
    lineItems: [{ description: 'Plumbing labor', quantity: 1, unit: 'job', unitPrice: 50_000, itemType: 'labor' }],
  })).rejects.toMatchObject({ statusCode: 403 });

  expect(calls.some((sql) => /INSERT INTO booking_quotes/.test(sql))).toBe(false);
});
