import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1280, breakpoint: 'desktop', isPhone: false, isTablet: false, isDesktop: true }),
  byBreakpoint: (_breakpoint: string, values: { desktop: unknown }) => values.desktop,
}));
jest.mock('@/services/provider-api.service', () => ({
  getProviderBookings: jest.fn().mockResolvedValue({
    bookings: [{
      id: 'booking-1', status: 'in_progress', serviceName: 'Post-build cleaning',
      customerName: 'Cebu Homes Inc.', address: '1 Build Road', barangay: 'Lahug', city: 'Cebu City',
      servicePrice: 250000, scheduledAt: '2026-08-25T09:00:00+08:00', createdAt: '2026-08-20T09:00:00+08:00',
    }],
    total: 1, page: 1, pageSize: 15,
  }),
}));
jest.mock('@/components/provider/NbiStatusBanner', () => ({ __esModule: true, default: () => null }));

import ProviderJobsScreen from '../app/(provider-tabs)/jobs';

it('Bug UX-334 — provider jobs use a bounded wide workspace with customer and work context', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><ProviderJobsScreen /></QueryClientProvider>);

  expect(screen.getByLabelText('Tablet and desktop provider jobs workspace')).toBeTruthy();
  await waitFor(() => expect(screen.getByText('Customer: Cebu Homes Inc.')).toBeTruthy());
  expect(screen.getByText('Post-build cleaning')).toBeTruthy();
});
