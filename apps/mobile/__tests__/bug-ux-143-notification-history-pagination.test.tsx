import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockGetNotifications = jest.fn().mockImplementation(async (page: number) => ({
  notifications: [{
    id: `notification-${page}`, type: 'booking_confirmed', title: page === 1 ? 'Newest update' : 'Earlier update',
    body: 'Booking activity', data: { bookingId: `booking-${page}` }, isRead: true, createdAt: `2026-08-2${5 - page}T00:00:00.000Z`,
  }],
  unread: 0,
  total: 2,
}));

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), back: jest.fn() }) }));
jest.mock('@/services/notification.service', () => ({
  getNotifications: (...args: unknown[]) => mockGetNotifications(...args),
  markNotificationRead: jest.fn(), markAllNotificationsRead: jest.fn(),
}));

import CustomerNotificationsScreen from '../app/customer/notifications';

it('Bug UX-143 — notification history can load records older than the first 50-item page', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><CustomerNotificationsScreen /></QueryClientProvider>);

  expect(await screen.findByText('Newest update')).toBeTruthy();
  fireEvent.click(screen.getByText('Load earlier notifications'));
  expect(await screen.findByText('Earlier update')).toBeTruthy();
  expect(mockGetNotifications).toHaveBeenNthCalledWith(1, 1, 50);
  expect(mockGetNotifications).toHaveBeenNthCalledWith(2, 2, 50);
});
