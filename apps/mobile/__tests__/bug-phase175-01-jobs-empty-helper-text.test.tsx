import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('@/services/provider-api.service', () => ({
  getProviderBookings: jest.fn().mockResolvedValue({ bookings: [], total: 0, page: 1, pageSize: 15 }),
}));
jest.mock('@/components/provider/NbiStatusBanner', () => ({ __esModule: true, default: () => null }));

import ProviderJobsScreen from '../app/(provider-tabs)/jobs';

it('BUG-PHASE175-01 — each empty Jobs filter explains what will appear there', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><ProviderJobsScreen /></QueryClientProvider>);

  expect(await screen.findByText(/Make sure you're online/i)).toBeTruthy();
  fireEvent.click(screen.getByText('Completed'));
  await waitFor(() => expect(screen.getByText(/customer confirms or after the auto-confirm window/i)).toBeTruthy());
  fireEvent.click(screen.getByText('Cancelled'));
  await waitFor(() => expect(screen.getByText('Cancelled jobs will appear here.')).toBeTruthy());
});
