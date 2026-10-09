import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';

const apiGet = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', () => ({ default: { get: apiGet } }));
vi.mock('@/lib/use-admin-socket', () => ({ useAdminSocketEvent: vi.fn() }));
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: { user: { role: string } }) => unknown) => selector({ user: { role: 'admin' } }),
}));

import DisputesPage from '../DisputesPage';

beforeEach(() => {
  apiGet.mockReset();
  apiGet
    .mockRejectedValueOnce(new Error('dispute source offline'))
    .mockResolvedValue({
      data: { success: true, data: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } },
    });
});

it('Bug UX-1260 - a failed dispute queue read offers an in-place retry and recovers to the empty state', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter><DisputesPage /></MemoryRouter>
    </QueryClientProvider>,
  );

  expect(await screen.findByRole('heading', { name: 'Dispute queue unavailable' })).toBeInTheDocument();
  expect(screen.getByText(/Do not treat this as an empty queue/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Retry disputes' }));

  await waitFor(() => expect(apiGet).toHaveBeenCalledTimes(2));
  expect(await screen.findByText('No disputes found.')).toBeInTheDocument();
});
