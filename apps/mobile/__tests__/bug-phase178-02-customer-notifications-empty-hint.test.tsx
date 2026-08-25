import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('@/services/notification.service', () => ({
  getNotifications: jest.fn().mockResolvedValue({ notifications: [], unread: 0, total: 0 }),
  markNotificationRead: jest.fn(),
  markAllNotificationsRead: jest.fn(),
}));

import CustomerNotificationsScreen from '../app/customer/notifications';

it('Bug PHASE178-02 — the rendered customer notification empty state explains which updates will appear', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><CustomerNotificationsScreen /></QueryClientProvider>);
  expect(await screen.findByText('No notifications yet')).toBeTruthy();
  expect(screen.getByText('Booking updates, provider arrivals, quotes, and promos will appear here.')).toBeTruthy();
});
