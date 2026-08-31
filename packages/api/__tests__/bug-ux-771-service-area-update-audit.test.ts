jest.mock('../src/models/db', () => {
  const helper = jest.requireActual('./helpers/d06-tx-mock') as typeof import('./helpers/d06-tx-mock');
  return helper.createDbMock();
});
jest.mock('../src/utils/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } }));
jest.mock('../src/services/notification.service', () => ({ createPushNotification: jest.fn() }));

import { updateServiceArea } from '../src/services/service-area.service';
import { getTransactionInvocations, makeRouter, resetDbMock, setTxQueryImpl } from './helpers/d06-tx-mock';

beforeEach(resetDbMock);

it('Bug UX-771 — a market configuration update rejects when its audit write fails in the same transaction', async () => {
  setTxQueryImpl(makeRouter([{
    match: /SELECT \* FROM service_areas WHERE id = \$1 FOR UPDATE/,
    rows: [{ id: 'area-1', name: 'Old name', slug: 'old-name', status: 'planned', is_default: false, min_providers_to_launch: 5 }],
  }, {
    match: /UPDATE service_areas SET/,
    rows: [{ id: 'area-1', name: 'New name', slug: 'new-name', status: 'planned', is_default: false, min_providers_to_launch: 5 }],
  }, {
    match: /INSERT INTO admin_actions/,
    throwError: new Error('audit unavailable'),
  }]));

  await expect(updateServiceArea(
    'area-1',
    { name: 'New name' },
    'admin-1',
    'Correcting the approved market display name.',
  )).rejects.toThrow('audit unavailable');
  expect(getTransactionInvocations()).toBe(1);
});
