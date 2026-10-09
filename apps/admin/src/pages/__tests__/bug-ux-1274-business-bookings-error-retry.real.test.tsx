import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const apiGet = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', () => ({
  default: { get: apiGet },
  getErrorMessage: (error: Error) => error.message,
}));

import { BusinessBookingsTab } from '../BusinessAccountDetailPage';

it('Bug UX-1274 - a failed business-booking read offers recovery without showing no work or support linkage', async () => {
  apiGet
    .mockRejectedValueOnce(new Error('business bookings source offline'))
    .mockResolvedValueOnce({ data: { success: true, data: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><MemoryRouter><BusinessBookingsTab accountId="business-1" accountName="Cebu Offices" ownerUserId={null} /></MemoryRouter></QueryClientProvider>);

  expect(await screen.findByRole('heading', { name: 'Business bookings unavailable' })).toBeInTheDocument();
  expect(screen.getByText(/Do not treat it as having no bookings/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Retry business bookings' }));

  await waitFor(() => expect(apiGet).toHaveBeenCalledTimes(2));
  expect(await screen.findByText('No bookings are linked to this business account.')).toBeInTheDocument();
});
