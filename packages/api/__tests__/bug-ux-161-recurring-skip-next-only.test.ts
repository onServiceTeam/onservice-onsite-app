const queryMock = jest.fn();
const transactionMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: {
    query: (...args: unknown[]) => queryMock(...args),
    transaction: (...args: unknown[]) => transactionMock(...args),
  },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('../src/services/notification.service', () => ({ createPushNotification: jest.fn() }));
jest.mock('../src/services/recurring-auto-charge.service', () => ({ attemptAutoCharge: jest.fn() }));
jest.mock('../src/services/booking.service', () => ({ calculateServiceFee: jest.fn() }));

import { skipNextInstance } from '../src/services/recurring.service';

it('BUG-UX-161 — recurring skip rejects a caller-selected date that is not the next occurrence', async () => {
  queryMock.mockResolvedValueOnce({
    rows: [{ id: 'recurring-1', customer_id: 'customer-1', status: 'active', next_booking_date: '2026-09-01' }],
  });

  await expect(skipNextInstance('recurring-1', 'customer-1', '2027-12-31'))
    .rejects.toThrow('Only the next scheduled recurring date can be skipped.');

  expect(transactionMock).not.toHaveBeenCalled();
});
