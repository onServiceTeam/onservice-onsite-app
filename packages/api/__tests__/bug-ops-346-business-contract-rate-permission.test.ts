const queryMock = jest.fn();

jest.mock('../src/models/db', () => ({
  db: { query: (...args: unknown[]) => queryMock(...args) },
}));
jest.mock('../src/services/notification.service', () => ({ createPushNotification: jest.fn() }));
jest.mock('../src/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { getContracts } from '../src/services/business.service';

it('Bug OPS-346 — an ordinary member without financial permission cannot retrieve company contract rates', async () => {
  queryMock.mockResolvedValueOnce({
    rows: [{ role: 'member', can_view_invoices: false }],
    rowCount: 1,
  });

  await expect(getContracts(
    '00000000-0000-4000-8000-000000000346',
    '00000000-0000-4000-8000-000000000001',
  )).rejects.toMatchObject({ statusCode: 403 });

  expect(queryMock).toHaveBeenCalledTimes(1);
});
