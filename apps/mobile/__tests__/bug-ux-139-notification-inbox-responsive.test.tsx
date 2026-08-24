import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), back: jest.fn() }) }));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1024, breakpoint: 'tablet', isPhone: false, isTablet: true, isDesktop: false }),
}));
jest.mock('@/services/notification.service', () => ({
  getNotifications: jest.fn().mockResolvedValue({ notifications: [], unread: 0, total: 0 }),
  markNotificationRead: jest.fn(), markAllNotificationsRead: jest.fn(),
}));

import CustomerNotificationsScreen from '../app/customer/notifications';
import ProviderNotificationsScreen from '../app/provider/notifications';

function renderInbox(Screen: React.ComponentType): HTMLElement {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={client}><Screen /></QueryClientProvider>).container;
}

it('Bug UX-139 — customer and provider notification inboxes use a bounded tablet and desktop reading workspace', async () => {
  const customer = renderInbox(CustomerNotificationsScreen);
  expect(await screen.findByText('No notifications yet')).toBeTruthy();
  expect(customer.querySelector('[accessibilitylabel="Wide customer notification inbox"]')).toBeTruthy();
  cleanup();
  const provider = renderInbox(ProviderNotificationsScreen);
  expect(await screen.findByText('No notifications yet')).toBeTruthy();
  expect(provider.querySelector('[accessibilitylabel="Wide provider notification inbox"]')).toBeTruthy();
});
