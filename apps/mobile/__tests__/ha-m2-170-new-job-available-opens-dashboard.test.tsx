// HA-M2-170 (D38 Milestone 2, package P5a): tapping a fixed-price "new job
// available" notice opens the dashboard. It used to open the job detail,
// which answers 404 to a pro the job is not assigned to.
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

it('HA-M2-170: a new_job_available tap opens the provider dashboard, not the unassigned job', () => {
  render(<Harness />);
  act(() => {
    mockResponseListener!({
      notification: { request: { content: { data: { type: 'new_job_available', bookingId: 'booking-9' } } } },
    });
  });
  expect(mockRouterPush).toHaveBeenCalledWith('/(provider-tabs)/dashboard');
  expect(mockRouterPush).not.toHaveBeenCalledWith('/provider/job/booking-9');
});
