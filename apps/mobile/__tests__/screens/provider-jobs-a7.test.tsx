// A7 — (provider-tabs)/jobs now uses the shared UI kit (EmptyState / ErrorState
// + SkeletonCard for the list states). Real DOM-render tests driving the data
// layer (mocked provider-api.service) through each state.

import React from 'react';
import { render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('@/services/provider-api.service', () => ({
  getProviderBookings: jest.fn(),
}));
// NbiStatusBanner fetches its own status; stub it so it doesn't interfere.
jest.mock('@/components/provider/NbiStatusBanner', () => ({
  __esModule: true,
  default: () => null,
}));

import ProviderJobsScreen from '../../app/(provider-tabs)/jobs';
import { getProviderBookings } from '@/services/provider-api.service';

function renderScreen(): { container: HTMLElement } {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const { container } = render(
    React.createElement(QueryClientProvider, { client }, React.createElement(ProviderJobsScreen)),
  );
  return { container };
}

const page = (bookings: unknown[]): unknown => ({ bookings, total: bookings.length, page: 1, pageSize: 15 });

beforeEach(() => {
  (getProviderBookings as jest.Mock).mockReset();
});

describe('A7 — provider jobs shared-kit states', () => {
  it('renders the EmptyState for the active filter when there are no jobs', async () => {
    (getProviderBookings as jest.Mock).mockResolvedValue(page([]));
    const { container } = renderScreen();
    await waitFor(() => {
      expect(container.textContent).toContain('No active jobs');
    });
  });

  it('renders the ErrorState with a retry affordance when the query fails', async () => {
    (getProviderBookings as jest.Mock).mockRejectedValue(new Error('boom'));
    const { container } = renderScreen();
    await waitFor(() => {
      expect(container.textContent).toContain('Try Again');
    });
    expect(container.textContent?.toLowerCase()).toContain('jobs');
  });

  it('renders the job list when data loads', async () => {
    (getProviderBookings as jest.Mock).mockResolvedValue(
      page([
        {
          id: 'j1',
          status: 'confirmed',
          serviceName: 'Deep Clean',
          categoryName: 'Cleaning',
          address: '1 Mango St',
          barangay: 'Lahug',
          city: 'Cebu City',
          servicePrice: 50000,
          scheduledAt: '2026-06-10T08:00:00+08:00',
          createdAt: '2026-06-01T08:00:00+08:00',
        },
      ]),
    );
    const { container } = renderScreen();
    await waitFor(() => {
      expect(container.textContent).toContain('Deep Clean');
    });
  });
});
