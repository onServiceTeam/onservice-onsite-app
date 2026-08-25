import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('@/services/notification.service', () => ({
  getNotifications: jest.fn().mockResolvedValue({ notifications: [], unread: 0, total: 0 }),
  markNotificationRead: jest.fn(),
  markAllNotificationsRead: jest.fn(),
}));

import ProviderNotificationsScreen from '../app/provider/notifications';

it('Bug PHASE178-01 — the rendered provider notification empty state explains which updates will appear', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><ProviderNotificationsScreen /></QueryClientProvider>);
  expect(await screen.findByText('No notifications yet')).toBeTruthy();
  expect(screen.getByText('Job offers, payment releases, reviews, and tier updates will appear here.')).toBeTruthy();
});
