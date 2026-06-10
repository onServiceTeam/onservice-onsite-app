// Round-3 audit (2026-06-10) — provider Jobs tab crashed on every platform.
//
// Root cause: (provider-tabs)/dashboard.tsx cached its "Active Jobs" preview
// with useQuery(['providerJobs', 'active']) — the EXACT key the Jobs tab
// reads with useInfiniteQuery(['providerJobs', filter]) when filter='active'
// (the default). query-core then treats the plain {bookings,...} object as
// InfiniteData and throws "Cannot read properties of undefined (reading
// 'length')" on pages.length, blowing the whole app into the ErrorBoundary.
// Dashboard is the provider landing tab, so the crash fired on essentially
// every visit to Jobs. Fix: dashboard preview key gains a
// 'dashboard-preview' discriminator (keeping the ['providerJobs'] prefix so
// existing invalidations still refresh it).
//
// Regression test: render the dashboard with a shared QueryClient (it seeds
// its preview cache), then render the Jobs screen against the SAME client
// and assert the list renders instead of throwing. Pre-fix this test throws.

import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('@/services/provider-api.service', () => ({
  getMyProfile: jest.fn(),
  getProviderBookings: jest.fn(),
  setAvailability: jest.fn(),
}));
// (dashboard's unread-count badge calls api.get directly; the global
// @/services/api mock from jest.setup covers it.)

// The dashboard renders NbiStatusBanner (own query) — neutralize it.
jest.mock('@/components/provider/NbiStatusBanner', () => ({
  __esModule: true,
  default: () => null,
}));

import DashboardScreen from '../../app/(provider-tabs)/dashboard';
import ProviderJobsScreen from '../../app/(provider-tabs)/jobs';
import * as providerApi from '@/services/provider-api.service';

const bookingsPage = {
  bookings: [
    {
      id: 'b-1',
      status: 'pending_confirmation',
      serviceName: 'Faucet Repair',
      categoryName: 'Plumbing',
      address: 'Lahug',
      barangay: 'Lahug',
      city: 'Cebu City',
      servicePrice: 50000,
      scheduledAt: '2026-06-12T08:00:00.000Z',
      createdAt: '2026-06-09T08:00:00.000Z',
    },
  ],
  total: 1,
  page: 1,
  pageSize: 15,
};

function withClient(client: QueryClient, child: React.ReactElement): React.ReactElement {
  return React.createElement(QueryClientProvider, { client }, child);
}

describe('provider Jobs tab — dashboard query-cache collision', () => {
  it('renders the jobs list after the dashboard seeded its preview cache (same QueryClient)', async () => {
    (providerApi.getMyProfile as jest.Mock).mockResolvedValue({
      businessName: 'Roberto Plumbing',
      tier: 'verified',
      isAvailable: true,
      rating: 4.8,
      totalJobs: 52,
      acceptanceRate: 0,
    });
    (providerApi.getProviderBookings as jest.Mock).mockResolvedValue(bookingsPage);

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: Infinity } },
    });

    // 1. Dashboard mounts first (it is the provider landing tab) and caches
    //    its Active Jobs preview.
    const dash = render(withClient(client, React.createElement(DashboardScreen)));
    await waitFor(() => {
      expect(providerApi.getProviderBookings).toHaveBeenCalledWith('active', 1, 5);
    });
    dash.unmount();

    // 2. Jobs tab mounts against the same client with its default 'active'
    //    filter. Pre-fix: query-core reads the plain preview object as
    //    InfiniteData and throws on pages.length during render.
    const jobs = render(withClient(client, React.createElement(ProviderJobsScreen)));
    await waitFor(() => {
      expect(jobs.container.textContent).toContain('Faucet Repair');
    });

    // The infinite list fetched its own page (pageSize 15, not the preview 5).
    expect(providerApi.getProviderBookings).toHaveBeenCalledWith('active', 1, 15);
  });
});
