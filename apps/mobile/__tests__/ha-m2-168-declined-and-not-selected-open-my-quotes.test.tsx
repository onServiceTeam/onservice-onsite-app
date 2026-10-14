// HA-M2-168 (D38 Milestone 2, package P5a): a pro who taps "the customer
// declined your quote" or "the customer chose another pro" lands on My
// quotes (the Requests tab's quotes segment), where the outcome is listed.
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

it('HA-M2-168: quote_declined and quote_not_selected taps open My quotes', () => {
  render(<Harness />);
  tap({ type: 'quote_declined', bookingId: 'booking-1', quoteId: 'quote-1', reason: 'too_expensive' });
  tap({ type: 'quote_not_selected', bookingId: 'booking-2', quoteId: 'quote-2' });

  expect(mockRouterPush).toHaveBeenNthCalledWith(1, '/(provider-tabs)/requests?tab=quotes');
  expect(mockRouterPush).toHaveBeenNthCalledWith(2, '/(provider-tabs)/requests?tab=quotes');
});
