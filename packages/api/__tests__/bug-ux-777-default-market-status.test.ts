jest.mock('../src/models/db', () => {
  const helper = jest.requireActual('./helpers/d06-tx-mock') as typeof import('./helpers/d06-tx-mock');
  return helper.createDbMock();
});
jest.mock('../src/utils/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } }));
jest.mock('../src/services/notification.service', () => ({ createPushNotification: jest.fn() }));

import { setDefaultServiceArea } from '../src/services/service-area.service';
import { getTxCalls, makeRouter, resetDbMock, setTxQueryImpl } from './helpers/d06-tx-mock';

beforeEach(resetDbMock);

it('Bug UX-777 — a non-bookable market cannot become the customer and provider app default', async () => {
  setTxQueryImpl(makeRouter([{
    match: /SELECT \* FROM service_areas WHERE id = \$1 FOR UPDATE/,
    rows: [{ id: 'area-1', name: 'Davao', slug: 'davao', status: 'recruiting', is_default: false }],
  }]));

  await expect(setDefaultServiceArea(
    'area-1',
    'admin-1',
    'Selecting the approved starting market for app users.',
  )).rejects.toMatchObject({ statusCode: 409 });
  expect(getTxCalls().some(({ sql }) => /UPDATE service_areas SET is_default/.test(sql))).toBe(false);
});
