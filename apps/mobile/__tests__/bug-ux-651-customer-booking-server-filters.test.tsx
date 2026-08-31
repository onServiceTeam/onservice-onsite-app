import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockGet = jest.fn();

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('@/services/api', () => ({
  __esModule: true,
  default: { get: (...args: unknown[]) => mockGet(...args) },
}));

import BookingsScreen from '../app/(tabs)/bookings';

it('Bug UX-651 — customer booking sort and period filters apply to the server-paginated history', async () => {
  mockGet.mockResolvedValue({ data: { data: [], meta: { page: 1, pageSize: 15, total: 0, totalPages: 1 } } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><BookingsScreen /></QueryClientProvider>);

  await screen.findByText('No bookings yet');
  fireEvent.click(screen.getByRole('button', { name: 'Open booking filters' }));
  fireEvent.click(screen.getByText('Oldest first'));
  fireEvent.click(screen.getByText('Last 30 days'));
  fireEvent.click(screen.getByRole('button', { name: 'Apply filters' }));

  await waitFor(() => expect(mockGet).toHaveBeenLastCalledWith('/api/v1/bookings', {
    params: { page: 1, pageSize: 15, sort: 'oldest', periodDays: 30 },
  }));
});
