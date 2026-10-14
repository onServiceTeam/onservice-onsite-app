// HA-M2-218 (D38 Milestone 2, package P5b): the provider dashboard's
// Requests card shows the counts from the request summary (open requests in
// the area, how many are new, quotes waiting for a customer's answer) and
// opens the Requests tab.
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

it('HA-M2-218: the Requests card shows open, new and waiting counts from the summary and opens the Requests tab', async () => {
  routeGets({
    '/api/v1/providers/me/job-requests/summary': ok({ openCount: 4, unseenCount: 3, quotesWaitingCount: 1, isAvailable: true }),
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><ProviderDashboardScreen /></QueryClientProvider>);

  expect(await screen.findByText('4 open requests in your area, 3 new')).toBeTruthy();
  expect(screen.getByText("1 quote waiting for a customer's answer")).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Open requests' }));
  expect(mockPush).toHaveBeenCalledWith('/(provider-tabs)/requests');
});
