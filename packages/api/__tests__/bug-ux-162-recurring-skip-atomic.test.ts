const queryMock = jest.fn();
const transactionMock = jest.fn();
const clientQueryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: {
    query: (...args: unknown[]) => queryMock(...args),
    transaction: (callback: (client: { query: typeof clientQueryMock }) => unknown) => {
      transactionMock();
      return callback({ query: clientQueryMock });
    },
  },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('../src/services/notification.service', () => ({ createPushNotification: jest.fn() }));
jest.mock('../src/services/recurring-auto-charge.service', () => ({ attemptAutoCharge: jest.fn() }));
jest.mock('../src/services/booking.service', () => ({ calculateServiceFee: jest.fn() }));

import { skipNextInstance } from '../src/services/recurring.service';

it('BUG-UX-162 — recurring skip advances the clock and writes history in one transaction', async () => {
  const recurring = {
    id: 'recurring-1', customer_id: 'customer-1', status: 'active',
    next_booking_date: '2026-09-01', frequency: 'weekly', preferred_day: 2,
  };
  queryMock.mockResolvedValueOnce({ rows: [recurring] });
  clientQueryMock
    .mockResolvedValueOnce({ rows: [{ ...recurring, next_booking_date: '2026-09-08' }] })
    .mockResolvedValueOnce({ rows: [] });

  const result = await skipNextInstance('recurring-1', 'customer-1', '2026-09-01');

  expect(result.next_booking_date).toBe('2026-09-08');
  expect(transactionMock).toHaveBeenCalledTimes(1);
  expect(clientQueryMock).toHaveBeenCalledTimes(2);
  expect(clientQueryMock.mock.calls[0]![0]).toContain("next_booking_date = $1::date");
  expect(clientQueryMock.mock.calls[1]![0]).toContain('ON CONFLICT (recurring_booking_id, scheduled_date) DO NOTHING');
});
