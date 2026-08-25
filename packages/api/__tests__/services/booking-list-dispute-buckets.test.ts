const dbQueryMock = jest.fn();

jest.mock('../../src/models/db', () => ({
  db: { query: (...args: unknown[]) => dbQueryMock(...args) },
}));
jest.mock('../../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { listBookings } from '../../src/services/booking.service';

it('Bug UX-333 — disputed work stays active and resolved work remains in participant history', async () => {
  dbQueryMock.mockResolvedValue({ rows: [{ count: '0' }] });

  await listBookings('customer-1', 'customer', { page: 1, pageSize: 20, status: 'active' });
  await listBookings('customer-1', 'customer', { page: 1, pageSize: 20, status: 'completed' });

  expect(dbQueryMock.mock.calls[0]![1]).toContain('disputed');
  expect(dbQueryMock.mock.calls[2]![1]).toContain('resolved');
});
