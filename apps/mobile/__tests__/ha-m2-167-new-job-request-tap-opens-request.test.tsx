// HA-M2-167 (D38 Milestone 2, package P5a): tapping a "new request" phone
// notice opens that request's detail with the quote form, not the general
// leads list it opened before.
import React from 'react';
import { act, render } from '@testing-library/react';

const mockRouterPush = jest.fn();
let mockResponseListener: ((response: {
  notification: { request: { content: { data?: Record<string, unknown> } } };
}) => void) | null = null;

jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockRouterPush }) }));
jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn(),
  AndroidImportance: { MAX: 5 },
  getPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  requestPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  getExpoPushTokenAsync: jest.fn(async () => ({ data: 'expo-token' })),
  addNotificationReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  addNotificationResponseReceivedListener: jest.fn((callback) => {
    mockResponseListener = callback;
    return { remove: jest.fn() };
  }),
}));
jest.mock('expo-device', () => ({ isDevice: true }));
jest.mock('../src/services/secure-storage', () => ({
  getStoredUser: jest.fn(() => JSON.stringify({ role: 'provider' })),
}));
jest.mock('../src/services/secure-storage.service', () => ({
  getPublicItem: jest.fn(() => null),
  setPublicItem: jest.fn(),
}));

import { usePushNotifications } from '../src/services/push.service';

function Harness(): React.ReactElement {
  usePushNotifications();
  return <div>push harness</div>;
}

it('HA-M2-167: a new_job_request tap opens /provider/job/<booking>/quote', () => {
  render(<Harness />);
  act(() => {
    mockResponseListener!({
      notification: { request: { content: { data: { type: 'new_job_request', bookingId: 'booking-12' } } } },
    });
  });
  expect(mockRouterPush).toHaveBeenCalledWith('/provider/job/booking-12/quote');
});
