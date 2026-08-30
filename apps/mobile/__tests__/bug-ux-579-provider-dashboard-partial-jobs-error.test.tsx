import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { getProviderBookings } from '@/services/provider-api.service';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1100, breakpoint: 'desktop', isPhone: false, isTablet: false, isDesktop: true }),
}));
jest.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({
    user: { firstName: 'Roberto', lastName: 'Villanueva', role: 'provider' },
  }),
}));
jest.mock('@/components/provider/NbiStatusBanner', () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock('@/services/api', () => ({
  __esModule: true,
  default: { get: jest.fn().mockResolvedValue({ data: { meta: { unread: 0 } } }) },
}));
jest.mock('@/services/provider-api.service', () => ({
  getMyProfile: jest.fn().mockResolvedValue({
    tier: 'verified',
    isAvailable: true,
    rating: 4.5,
    totalJobs: 22,
    acceptanceRate: 0.92,
    services: [{ id: 'service-1', subcategoryName: 'Plumbing' }],
  }),
  setAvailability: jest.fn(),
  getProviderBookings: jest.fn().mockRejectedValue(new Error('jobs feed unavailable')),
}));

import ProviderDashboardScreen from '../app/(provider-tabs)/dashboard';

it('Bug UX-579 — a failed active-jobs feed is not presented as an empty provider queue', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(
    <QueryClientProvider client={client}>
      <ProviderDashboardScreen />
    </QueryClientProvider>,
  );

  expect(await screen.findByText('Active jobs unavailable')).toBeTruthy();
  expect(screen.queryByText('No active jobs right now')).toBeNull();
  expect(screen.getByText('Hello, Roberto')).toBeTruthy();

  fireEvent.click(screen.getByRole('button', { name: 'Retry loading' }));
  await waitFor(() => expect(getProviderBookings).toHaveBeenCalledTimes(2));
});
