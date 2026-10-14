// HA-M2-518 (D38 Milestone 2, package P5a review fix, missing coverage): a
// pro who taps "the customer cancelled their request" (job_request_cancelled)
// or "your quote expired" (quote_expired) lands on My quotes, where the
// outcome is listed. The booking is not theirs, so its job detail would
// answer 404; the tap must never fall through to it.
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

it('HA-M2-518: job_request_cancelled and quote_expired taps open My quotes, never the job detail', () => {
  render(<Harness />);
  tap({ type: 'job_request_cancelled', bookingId: 'booking-21' });
  tap({ type: 'quote_expired', bookingId: 'booking-22', quoteId: 'quote-22' });

  expect(mockRouterPush).toHaveBeenNthCalledWith(1, '/(provider-tabs)/requests?tab=quotes');
  expect(mockRouterPush).toHaveBeenNthCalledWith(2, '/(provider-tabs)/requests?tab=quotes');
  expect(mockRouterPush.mock.calls.flat().some((route) => String(route).startsWith('/provider/job/'))).toBe(false);
});
