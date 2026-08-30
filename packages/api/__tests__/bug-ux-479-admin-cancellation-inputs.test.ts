const dbQueryMock = jest.fn();
jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => dbQueryMock(...args), transaction: jest.fn() },
}));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { cancelBookingAsAdmin } from '../src/services/booking-admin.service';

it('Bug UX-479 — admin cancellation rejects malformed money-affecting inputs before reading or changing a booking', async () => {
  await expect(cancelBookingAsAdmin('booking-1', 'Support verified cancellation', 'admin-1', Number.NaN, false, false))
    .rejects.toMatchObject({ statusCode: 400 });
  await expect(cancelBookingAsAdmin('booking-1', 'Support verified cancellation', 'admin-1', 2, 'false', false))
    .rejects.toMatchObject({ statusCode: 400 });
  expect(dbQueryMock).not.toHaveBeenCalled();
});
