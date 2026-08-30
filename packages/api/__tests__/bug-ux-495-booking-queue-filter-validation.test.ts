const dbQueryMock = jest.fn();
jest.mock('../src/models/db', () => ({ db: { query: (...args: unknown[]) => dbQueryMock(...args), transaction: jest.fn() } }));
jest.mock('../src/utils/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } }));

import { listBookingsAdmin } from '../src/services/admin.service';

it('Bug UX-495 — booking queue rejects invented status, view, and sort values before querying operational data', async () => {
  await expect(listBookingsAdmin({ status: 'finished', page: 1, pageSize: 20 })).rejects.toMatchObject({ statusCode: 400 });
  await expect(listBookingsAdmin({ view: 'mine', page: 1, pageSize: 20 })).rejects.toMatchObject({ statusCode: 400 });
  await expect(listBookingsAdmin({ sort: 'oldest_problem', page: 1, pageSize: 20 })).rejects.toMatchObject({ statusCode: 400 });
  expect(dbQueryMock).not.toHaveBeenCalled();
});
