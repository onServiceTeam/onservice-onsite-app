// HA-M2-169 (D38 Milestone 2, package P5a): a customer who taps "we've sent
// your request to more pros" or "we're still looking for a pro" lands on
// that request's status screen.
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
  getStoredUser: jest.fn(() => JSON.stringify({ role: 'customer' })),
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

function tap(data: Record<string, unknown>): void {
  act(() => { mockResponseListener!({ notification: { request: { content: { data } } } }); });
}

it('HA-M2-169: request_reopened and request_still_looking taps open the request status screen', () => {
  render(<Harness />);
  tap({ type: 'request_reopened', bookingId: 'booking-5' });
  tap({ type: 'request_still_looking', bookingId: 'booking-6' });

  expect(mockRouterPush).toHaveBeenNthCalledWith(1, '/customer/booking/request-status?bookingId=booking-5');
  expect(mockRouterPush).toHaveBeenNthCalledWith(2, '/customer/booking/request-status?bookingId=booking-6');
});
