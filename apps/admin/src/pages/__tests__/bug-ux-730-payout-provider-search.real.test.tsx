import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import api from '@/lib/api';

vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));

import PayoutsPage from '../PayoutsPage';

it('Bug UX-730 — payout operators can search providers by human name instead of pasting a UUID', async () => {
  vi.mocked(api.get).mockResolvedValue({ data: {
    success: true, data: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
  } } as never);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(<QueryClientProvider client={client}><MemoryRouter><PayoutsPage /></MemoryRouter></QueryClientProvider>);

  await screen.findByText('No payout requests found.');
  fireEvent.change(screen.getByLabelText('Search providers by name or ID'), { target: { value: 'Cebu Home' } });
  fireEvent.click(screen.getByRole('button', { name: 'Search' }));

  await waitFor(() => expect(api.get).toHaveBeenCalledWith('/api/v1/payouts', {
    params: expect.objectContaining({ search: 'Cebu Home' }),
  }));
});
