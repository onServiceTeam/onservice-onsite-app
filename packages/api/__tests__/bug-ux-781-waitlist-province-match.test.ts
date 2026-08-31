jest.mock('../src/models/db', () => {
  const helper = jest.requireActual('./helpers/d06-tx-mock') as typeof import('./helpers/d06-tx-mock');
  return helper.createDbMock();
});
jest.mock('../src/utils/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } }));
jest.mock('../src/services/notification.service', () => ({ createPushNotification: jest.fn() }));

import { notifyWaitlist } from '../src/services/service-area.service';
import { getTopCalls, makeRouter, resetDbMock, setTopQueryImpl } from './helpers/d06-tx-mock';

beforeEach(resetDbMock);

it('Bug UX-781 — automatic waitlist notices match both city and province when no area ID is stored', async () => {
  setTopQueryImpl(makeRouter([{
    match: /SELECT \* FROM service_areas WHERE id = \$1/,
    rows: [{ id: 'area-1', name: 'San Fernando Pampanga', slug: 'san-fernando-pampanga', city: 'San Fernando', province: 'Pampanga' }],
  }, {
    match: /SELECT \* FROM area_waitlist/,
    rows: [],
  }]));

  await notifyWaitlist('area-1');

  const waitlistQuery = getTopCalls().find(({ sql }) => /SELECT \* FROM area_waitlist/.test(sql));
  expect(waitlistQuery?.sql).toMatch(/city ILIKE \$2 AND province ILIKE \$3/);
  expect(waitlistQuery?.params).toEqual(['area-1', 'San Fernando', 'Pampanga']);
});
