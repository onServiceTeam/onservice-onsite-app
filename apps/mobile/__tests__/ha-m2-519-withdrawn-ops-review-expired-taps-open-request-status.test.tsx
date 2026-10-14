// HA-M2-519 (D38 Milestone 2, package P5a review fix, missing coverage): a
// customer who taps "the pro withdrew their quote" (quote_withdrawn), "we're
// reaching out to more pros" (request_ops_review) or "your quote expired,
// we've reopened your request" (quote_expired) lands on that request's
// status screen (merged plan 2.5 and the critique's added types).
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

it('HA-M2-519: quote_withdrawn, request_ops_review and quote_expired taps open the request status screen', () => {
  render(<Harness />);
  tap({ type: 'quote_withdrawn', bookingId: 'booking-31', quoteId: 'quote-31' });
  tap({ type: 'request_ops_review', bookingId: 'booking-32' });
  tap({ type: 'quote_expired', bookingId: 'booking-33', quoteId: 'quote-33' });

  expect(mockRouterPush).toHaveBeenNthCalledWith(1, '/customer/booking/request-status?bookingId=booking-31');
  expect(mockRouterPush).toHaveBeenNthCalledWith(2, '/customer/booking/request-status?bookingId=booking-32');
  expect(mockRouterPush).toHaveBeenNthCalledWith(3, '/customer/booking/request-status?bookingId=booking-33');
});
