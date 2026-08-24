import React from 'react';
import { render } from '@testing-library/react';

const mockRegisterForPushNotifications = jest.fn().mockResolvedValue(true);
const mockAuthState: {
  isAuthenticated: boolean;
  user: { id: string } | null;
} = {
  isAuthenticated: true,
  user: { id: 'customer-1' },
};

jest.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: typeof mockAuthState) => unknown) => selector(mockAuthState),
}));
jest.mock('@/services/push.service', () => ({
  usePushNotifications: () => ({
    isRegistered: true,
    registerForPushNotifications: mockRegisterForPushNotifications,
  }),
}));

import { PushNotificationGate } from '@/components/PushNotificationGate';

it('Bug UX-244 — a cached device token is re-registered when the authenticated account changes', () => {
  const view = render(<PushNotificationGate />);
  expect(mockRegisterForPushNotifications).toHaveBeenCalledTimes(1);

  mockAuthState.user = { id: 'provider-2' };
  view.rerender(<PushNotificationGate />);

  expect(mockRegisterForPushNotifications).toHaveBeenCalledTimes(2);
});
