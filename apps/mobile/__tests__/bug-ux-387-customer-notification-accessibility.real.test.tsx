import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), back: jest.fn() }) }));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1024, breakpoint: 'tablet', isPhone: false, isTablet: true, isDesktop: false }),
}));
jest.mock('@/services/notification.service', () => ({
  getNotifications: jest.fn().mockResolvedValue({
    notifications: [{ id: 'notification-1', type: 'booking_confirmed', title: 'Booking confirmed', body: 'Your provider is assigned.', data: { bookingId: 'booking-1' }, isRead: false, createdAt: '2026-08-25T00:00:00.000Z' }],
    unread: 1,
    total: 2,
  }),
  markNotificationRead: jest.fn(),
  markAllNotificationsRead: jest.fn(),
}));

import NotificationsScreen from '../app/customer/notifications';

it('Bug UX-387 — customer notification rows, bulk-read, history paging, and back navigation are named controls', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><NotificationsScreen /></QueryClientProvider>);

  expect(await screen.findByRole('button', { name: 'Booking confirmed. Your provider is assigned.' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Go back from notifications' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Mark all notifications as read' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Load earlier notifications' })).toBeTruthy();
});
