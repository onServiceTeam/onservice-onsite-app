jest.mock('../src/models/db', () => {
  const helper = jest.requireActual('./helpers/d06-tx-mock') as typeof import('./helpers/d06-tx-mock');
  return helper.createDbMock();
});
jest.mock('../src/utils/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } }));
jest.mock('../src/services/notification.service', () => ({ createPushNotification: jest.fn() }));

import { updateServiceArea } from '../src/services/service-area.service';
import { getTxCalls, makeRouter, resetDbMock, setTxQueryImpl } from './helpers/d06-tx-mock';

beforeEach(resetDbMock);

it('Bug UX-770 — activation is refused when approved provider supply is below the configured floor', async () => {
  setTxQueryImpl(makeRouter([{
    match: /SELECT \* FROM service_areas WHERE id = \$1 FOR UPDATE/,
    rows: [{ id: 'area-1', name: 'Davao', slug: 'davao', status: 'recruiting', is_default: false, min_providers_to_launch: 5 }],
  }, {
    match: /COUNT\(\*\).*provider_service_areas/s,
    rows: [{ count: '3' }],
  }]));

  await expect(updateServiceArea(
    'area-1',
    { status: 'active' },
    'admin-1',
    'Provider capacity was checked before launch.',
  )).rejects.toMatchObject({ statusCode: 409, message: expect.stringContaining('at least 5') });

  expect(getTxCalls().some(({ sql }) => /UPDATE service_areas/.test(sql))).toBe(false);
  expect(getTxCalls().some(({ sql }) => /INSERT INTO admin_actions/.test(sql))).toBe(false);
});
