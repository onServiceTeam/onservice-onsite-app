import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockGetProviderBookings = jest.fn().mockResolvedValue({ bookings: [], total: 0, page: 1, pageSize: 15 });

jest.mock('@/services/provider-api.service', () => ({
  getProviderBookings: (...args: unknown[]) => mockGetProviderBookings(...args),
}));
jest.mock('@/components/provider/NbiStatusBanner', () => ({ __esModule: true, default: () => null }));

import ProviderJobsScreen from '../app/(provider-tabs)/jobs';

it('Bug UX-335 — provider Jobs sends pay sorting and date period to the paginated server query', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><ProviderJobsScreen /></QueryClientProvider>);
  await waitFor(() => expect(mockGetProviderBookings).toHaveBeenCalledWith('active', 1, 15));

  fireEvent.click(screen.getByLabelText('Sort and date filters'));
  fireEvent.click(screen.getByText('Highest pay'));
  fireEvent.click(screen.getByText('Last 30 days'));
  fireEvent.click(screen.getByLabelText('Apply filters'));

  await waitFor(() => expect(mockGetProviderBookings).toHaveBeenCalledWith(
    'active', 1, 15, { sort: 'highest_pay', periodDays: 30 },
  ));
});
