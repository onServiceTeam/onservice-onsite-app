import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import api from '@/lib/api';
import ProvidersPage from '../ProvidersPage';

it('Bug UX-436 — provider reactivation requires a reason and explains that existing booking holds remain', async () => {
  vi.mocked(api.get).mockResolvedValueOnce({
    data: {
      success: true,
      data: [{
        id: 'provider-1', userId: 'user-1', businessName: 'Cebu Aircon Care',
        fullName: 'Ramil Santos', phone: '+639170000001', email: 'ramil@example.com',
        status: 'suspended', tier: 'new', rating: 4.8, totalReviews: 8, totalJobs: 12,
        serviceRadiusKm: 20, isAvailable: false, city: 'Cebu City', province: 'Cebu',
        createdAt: '2026-08-30T01:00:00.000Z',
      }],
      pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
    },
  } as never);
  vi.mocked(api.put).mockResolvedValueOnce({ data: { success: true } } as never);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });

  render(
    <QueryClientProvider client={client}>
      <MemoryRouter><ProvidersPage /></MemoryRouter>
    </QueryClientProvider>,
  );

  fireEvent.click(await screen.findByRole('button', { name: 'Reactivate' }));
  expect(screen.getByText(/does not clear review holds on bookings/i)).toBeTruthy();
  const confirm = screen.getByRole('button', { name: 'Confirm' });
  expect(confirm).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Reason'), {
    target: { value: 'Identity review completed and suspension concern resolved.' },
  });
  fireEvent.click(confirm);

  await waitFor(() => expect(api.put).toHaveBeenCalledWith(
    '/api/v1/admin/providers/provider-1/reactivate',
    { reason: 'Identity review completed and suspension concern resolved.' },
  ));
});
