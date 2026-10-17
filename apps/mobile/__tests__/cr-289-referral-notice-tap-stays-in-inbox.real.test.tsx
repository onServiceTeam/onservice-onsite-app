// Customer review 2026-10-18, referral off switch (D41 Q32 option a): tapping
// a referral notice in the Notifications inbox marks it read and stays in the
// inbox. It does not open the hidden referral page, and does not open a
// second copy of the inbox on top of itself.
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockPush = jest.fn();
const mockMarkRead = jest.fn().mockResolvedValue(undefined);
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush, back: jest.fn() }) }));
jest.mock('@/hooks/useResponsive', () => ({ useResponsive: () => ({ isPhone: true }) }));
jest.mock('@/services/notification.service', () => ({
  getNotifications: jest.fn().mockResolvedValue({
    notifications: [{
      id: 'notification-referral', type: 'referral', title: 'Referral bonus', body: 'A friend used your code.',
      data: {}, isRead: false, createdAt: '2026-10-18T00:00:00.000Z',
    }],
    unread: 1,
    total: 1,
  }),
  markNotificationRead: (...a: unknown[]) => mockMarkRead(...a),
  markAllNotificationsRead: jest.fn(),
}));

import NotificationsScreen from '../app/customer/notifications';

it('Bug CR-289 — tapping a referral notice in the inbox stays in the inbox instead of opening the referral page', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><NotificationsScreen /></QueryClientProvider>);

  fireEvent.click(await screen.findByRole('button', { name: 'Referral bonus. A friend used your code.' }));

  await waitFor(() => expect(mockMarkRead).toHaveBeenCalledWith('notification-referral'));
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(mockPush).not.toHaveBeenCalled();
});
