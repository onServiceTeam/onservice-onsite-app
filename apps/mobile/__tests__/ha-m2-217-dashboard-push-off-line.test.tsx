// HA-M2-217 (D38 Milestone 2, package P5b): Android push is not set up yet
// (no Firebase project), so the provider dashboard says plainly when this
// device's phone alerts are off and that new requests show only while the
// app is open. A device whose push registration worked sees no such line.
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ok, routeGets } from '../test-support/request-fixtures';

let mockPushStatus = 'error';
jest.mock('@/services/push.service', () => ({
  getPushRegistrationStatus: () => mockPushStatus,
  onPushRegistrationStatus: () => () => undefined,
}));
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
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

const OFF_LINE = 'Phone alerts are off on this device. New requests show here only while the app is open.';

function renderDashboard(): ReturnType<typeof render> {
  routeGets({
    '/api/v1/providers/me/job-requests/summary': ok({ openCount: 0, unseenCount: 0, quotesWaitingCount: 0, isAvailable: true }),
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={client}><ProviderDashboardScreen /></QueryClientProvider>);
}

it('HA-M2-217: the dashboard says phone alerts are off and requests show only while the app is open, unless push registered', async () => {
  mockPushStatus = 'error';
  const off = renderDashboard();
  expect(await screen.findByText(OFF_LINE)).toBeTruthy();
  off.unmount();

  mockPushStatus = 'registered';
  renderDashboard();
  await waitFor(() => expect(screen.getByText('Hello, Roberto')).toBeTruthy());
  expect(screen.queryByText(OFF_LINE)).toBeNull();
  expect(screen.queryByText(/Phone alerts are off/)).toBeNull();
});
