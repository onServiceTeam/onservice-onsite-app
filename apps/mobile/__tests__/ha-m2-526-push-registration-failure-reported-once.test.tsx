// HA-M2-526 (D38 Milestone 2, package P5a review fix): when a phone cannot
// register for push (for example an Android build with no Firebase project,
// where getExpoPushTokenAsync throws), the failure is sent to Sentry as its
// own warning, once per app run, with no token or account details. Before,
// it was only a breadcrumb, which Sentry sends only if some later error is
// captured, so ops could not count the phones that will miss new requests.
import React from 'react';
import { act, render } from '@testing-library/react';
import { addBreadcrumb, captureMessage } from '@sentry/core';

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn(async () => undefined),
  AndroidImportance: { MAX: 5 },
  getPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  requestPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  getExpoPushTokenAsync: jest.fn(async () => {
    const error = new Error('Default FirebaseApp is not initialized in this process ph.onservice.app.');
    error.name = 'FirebaseNotInitialized';
    throw error;
  }),
  addNotificationReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
}));
jest.mock('expo-device', () => ({ isDevice: true }));
jest.mock('../src/services/secure-storage', () => ({ getStoredUser: jest.fn(() => null) }));
jest.mock('../src/services/secure-storage.service', () => ({ getPublicItem: jest.fn(() => null), setPublicItem: jest.fn() }));

import { getPushRegistrationStatus, usePushNotifications } from '../src/services/push.service';

let register: () => Promise<boolean> = async () => false;

function Harness(): React.ReactElement {
  register = usePushNotifications().registerForPushNotifications;
  return <div>push harness</div>;
}

it('HA-M2-526: a push registration failure is reported to Sentry once per run, without the token', async () => {
  jest.mocked(captureMessage).mockClear();
  jest.mocked(addBreadcrumb).mockClear();
  render(<Harness />);

  let first = true;
  await act(async () => { first = await register(); });
  await act(async () => { await register(); });

  expect(first).toBe(false);
  expect(getPushRegistrationStatus()).toBe('error');
  expect(captureMessage).toHaveBeenCalledTimes(1);
  expect(captureMessage).toHaveBeenCalledWith('push registration error', {
    level: 'warning',
    tags: { area: 'push' },
    extra: { reason: 'FirebaseNotInitialized' },
  });
  expect(JSON.stringify(jest.mocked(captureMessage).mock.calls)).not.toContain('expo-token');
});
