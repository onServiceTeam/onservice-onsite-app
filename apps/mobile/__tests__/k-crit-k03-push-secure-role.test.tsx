import React from 'react';
import { act, render } from '@testing-library/react';

const mockRouterPush = jest.fn();
let mockResponseListener: ((response: {
  notification: { request: { content: { data?: Record<string, unknown> } } };
}) => void) | null = null;

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockRouterPush }),
}));
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
jest.mock('expo-constants', () => ({ default: { expoConfig: { extra: { eas: { projectId: 'project-1' } } } } }));
jest.mock('../src/services/secure-storage', () => ({
  getStoredUser: jest.fn(() => JSON.stringify({ role: 'provider' })),
}));
jest.mock('../src/services/secure-storage.service', () => ({
  getPublicItem: jest.fn(() => null),
  setPublicItem: jest.fn(),
}));
jest.mock('../src/services/api', () => ({
  __esModule: true,
  default: { post: jest.fn() },
}));

import { usePushNotifications } from '../src/services/push.service';

function Harness(): React.ReactElement {
  usePushNotifications();
  return <div>push harness</div>;
}

describe('provider push deep links', () => {
  it('Bug CRIT-K03 — the stored provider role routes a message notification to the provider conversation', () => {
    render(<Harness />);
    expect(mockResponseListener).not.toBeNull();

    act(() => {
      mockResponseListener!({
        notification: {
          request: { content: { data: { type: 'new_message', conversationId: 'conversation-1' } } },
        },
      });
    });

    expect(mockRouterPush).toHaveBeenCalledWith('/provider/chat/conversation-1');
  });
});
