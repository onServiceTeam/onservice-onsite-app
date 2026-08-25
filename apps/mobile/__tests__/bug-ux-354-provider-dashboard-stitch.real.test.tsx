import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
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
  getProviderBookings: jest.fn().mockResolvedValue({
    bookings: [{
      id: 'booking-1',
      status: 'in_progress',
      scheduledAt: '2026-08-25T08:00:00.000Z',
      serviceName: 'Plumbing',
      servicePrice: 160000,
      address: '88 Banilad Road',
      barangay: 'Banilad',
      city: 'Mandaue',
    }],
  }),
}));

import ProviderDashboardScreen from '../app/(provider-tabs)/dashboard';

it('Bug UX-354 — the provider dashboard follows the Stitch operational hierarchy with identity, job-request entry, and an explicit job action', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(
    <QueryClientProvider client={client}>
      <ProviderDashboardScreen />
    </QueryClientProvider>,
  );

  await waitFor(() => expect(screen.getByText('Hello, Roberto')).toBeTruthy());
  expect(screen.getByLabelText('Provider account Roberto')).toBeTruthy();
  const requests = screen.getByRole('button', { name: 'Open job requests' });
  expect(requests.textContent).toContain('Browse open custom-quote requests');
  expect(screen.getByRole('button', { name: 'View Plumbing job' }).textContent).toContain('View');

  fireEvent.click(requests);
  expect(mockPush).toHaveBeenCalled();
});
