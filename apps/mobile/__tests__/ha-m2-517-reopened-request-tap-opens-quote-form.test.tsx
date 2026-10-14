// HA-M2-517 (D38 Milestone 2, package P5a review fix, missing coverage): a
// pro who taps "a customer is looking for another pro" (job_request_reopened,
// a request reopened after the customer declined a quote) lands on that
// request's detail with the quote form, the same as a new request.
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

function tap(data: Record<string, unknown>): void {
  act(() => { mockResponseListener!({ notification: { request: { content: { data } } } }); });
}

it('HA-M2-517: a job_request_reopened tap opens the request with the quote form', () => {
  render(<Harness />);
  tap({ type: 'job_request_reopened', bookingId: 'booking-17', round: 2 });

  expect(mockRouterPush).toHaveBeenCalledTimes(1);
  expect(mockRouterPush).toHaveBeenCalledWith('/provider/job/booking-17/quote');
});
