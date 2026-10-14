// HA-M2-219 (D38 Milestone 2, package P5b): providers reach their message
// threads from the dashboard (the tab bar stays at five tabs). The entry
// shows the unread count and opens the provider Messages screen.
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ok, routeGets } from '../test-support/request-fixtures';

const mockPush = jest.fn();
jest.mock('@/services/push.service', () => ({
  getPushRegistrationStatus: () => 'registered',
  onPushRegistrationStatus: () => () => undefined,
}));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 390, breakpoint: 'phone', isPhone: true, isTablet: false, isDesktop: false }),
}));
jest.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({
    isAuthenticated: true,
    user: { id: 'provider-user-1', firstName: 'Roberto', role: 'provider' },
  }),
}));
jest.mock('@/components/provider/NbiStatusBanner', () => ({ __esModule: true, default: () => null }));
jest.mock('@/services/socket.service', () => require('../test-support/socket-mock').socketServiceMock);
jest.mock('@/services/provider-api.service', () => ({
  getMyProfile: jest.fn().mockResolvedValue({ tier: 'verified', isAvailable: true, rating: 4.5, totalJobs: 22, acceptanceRate: 0.92, services: [] }),
  setAvailability: jest.fn(),
  getProviderBookings: jest.fn().mockResolvedValue({ bookings: [] }),
}));

import ProviderDashboardScreen from '../app/(provider-tabs)/dashboard';

it('HA-M2-219: the dashboard Messages entry shows the unread count and opens provider messages', async () => {
  routeGets({
    '/api/v1/providers/me/job-requests/summary': ok({ openCount: 0, unseenCount: 0, quotesWaitingCount: 0, isAvailable: true }),
    '/api/v1/conversations/unread/count': ok({ unreadCount: 2 }),
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><ProviderDashboardScreen /></QueryClientProvider>);

  const entry = await screen.findByRole('button', { name: 'Messages, 2 unread' });
  fireEvent.click(entry);
  expect(mockPush).toHaveBeenCalledWith('/provider/messages');
});
