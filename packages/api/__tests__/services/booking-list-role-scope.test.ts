const dbQueryMock = jest.fn();

jest.mock('../../src/models/db', () => ({
  db: { query: (...args: unknown[]) => dbQueryMock(...args) },
}));
jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { listBookings } from '../../src/services/booking.service';

it('Bug UX-332 — the participant booking list fails closed for admin, DPO, and staff roles', async () => {
  for (const role of ['admin', 'super_admin', 'dpo', 'provider_staff']) {
    await expect(listBookings('user-1', role, { page: 1, pageSize: 20 })).rejects.toMatchObject({ statusCode: 403 });
  }
  expect(dbQueryMock).not.toHaveBeenCalled();
});
