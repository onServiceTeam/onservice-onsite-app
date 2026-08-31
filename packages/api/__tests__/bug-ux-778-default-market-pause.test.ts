jest.mock('../src/models/db', () => {
  const helper = jest.requireActual('./helpers/d06-tx-mock') as typeof import('./helpers/d06-tx-mock');
  return helper.createDbMock();
});
jest.mock('../src/utils/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } }));
jest.mock('../src/services/notification.service', () => ({ createPushNotification: jest.fn() }));

import { updateServiceArea } from '../src/services/service-area.service';
import { getTxCalls, makeRouter, resetDbMock, setTxQueryImpl } from './helpers/d06-tx-mock';

beforeEach(resetDbMock);

it('Bug UX-778 — the current app default cannot be paused before a replacement default is selected', async () => {
  setTxQueryImpl(makeRouter([{
    match: /SELECT \* FROM service_areas WHERE id = \$1 FOR UPDATE/,
    rows: [{ id: 'area-1', name: 'Metro Cebu', slug: 'metro-cebu', status: 'active', is_default: true, min_providers_to_launch: 5 }],
  }]));

  await expect(updateServiceArea(
    'area-1',
    { status: 'paused' },
    'admin-1',
    'Pausing the market after the operations review.',
  )).rejects.toMatchObject({ statusCode: 409, message: expect.stringContaining('Set another') });
  expect(getTxCalls().some(({ sql }) => /UPDATE service_areas/.test(sql))).toBe(false);
});
