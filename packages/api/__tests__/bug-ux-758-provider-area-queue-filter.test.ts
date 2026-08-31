const queryMock = jest.fn();

jest.mock('../src/models/db', () => ({ db: { query: (...args: unknown[]) => queryMock(...args) } }));
jest.mock('../src/services/notification.service', () => ({ createPushNotification: jest.fn() }));

import { listPending } from '../src/services/service-area-change.service';

it('Bug UX-758 — a Provider 360 area-operations link filters in SQL before the global queue limit can hide that provider', async () => {
  queryMock.mockResolvedValueOnce({ rows: [], rowCount: 0 });
  const providerId = '0198f711-c7c8-7a42-8c86-43f49d91f2d0';

  await listPending(200, providerId);

  expect(queryMock).toHaveBeenCalledTimes(1);
  const [sql, params] = queryMock.mock.calls[0] as [string, unknown[]];
  expect(sql).toMatch(/\$2::uuid IS NULL OR p\.id = \$2::uuid/);
  expect(params).toEqual([200, providerId]);
  expect(sql.indexOf('p.id = $2::uuid')).toBeLessThan(sql.indexOf('LIMIT $1'));
});
