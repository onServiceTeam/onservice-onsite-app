jest.mock('../src/models/db', () => {
  const helper = jest.requireActual('./helpers/d06-tx-mock') as typeof import('./helpers/d06-tx-mock');
  return helper.createDbMock();
});
jest.mock('../src/utils/logger', () => ({ logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } }));
const createPushNotificationMock = jest.fn();
jest.mock('../src/services/notification.service', () => ({
  createPushNotification: (...args: unknown[]) => createPushNotificationMock(...args),
}));

import { notifyWaitlist } from '../src/services/service-area.service';
import { getTopCalls, makeRouter, resetDbMock, setTopQueryImpl } from './helpers/d06-tx-mock';

beforeEach(() => {
  resetDbMock();
  createPushNotificationMock.mockReset();
});

it('Bug UX-772 — a waitlist entry is not marked notified when no user can receive an in-app notice', async () => {
  setTopQueryImpl(makeRouter([{
    match: /SELECT \* FROM service_areas WHERE id = \$1/,
    rows: [{ id: 'area-1', name: 'Davao', slug: 'davao', city: 'Davao City', province: 'Davao del Sur' }],
  }, {
    match: /SELECT \* FROM area_waitlist/,
    rows: [{ id: 'wait-1', phone: '+639171234567' }],
  }, {
    match: /SELECT id FROM users WHERE phone/,
    rows: [],
  }]));

  await expect(notifyWaitlist('area-1')).resolves.toBe(0);
  expect(createPushNotificationMock).not.toHaveBeenCalled();
  expect(getTopCalls().some(({ sql }) => /UPDATE area_waitlist SET notified = TRUE/.test(sql))).toBe(false);
});
