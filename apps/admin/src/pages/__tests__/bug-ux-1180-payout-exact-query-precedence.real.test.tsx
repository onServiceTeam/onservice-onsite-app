import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const PAYOUT_ID = '11800000-0000-4000-8000-000000001180';
const apiMocks = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn() }));
vi.mock('@/lib/api', () => ({ default: apiMocks, getErrorMessage: () => 'Request failed' }));
vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { role: 'admin' } }),
}));

import PayoutsPage from '../PayoutsPage';

it('Bug UX-1180 — an exact payout target overrides stale page, provider, search, and status filters', async () => {
  apiMocks.get.mockResolvedValueOnce({ data: {
    success: true,
    data: [],
    pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
  } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/payouts?payoutId=${PAYOUT_ID}&page=9&providerId=21800000-0000-4000-8000-000000001180&search=other&status=failed`]}>
        <PayoutsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );

  await waitFor(() => expect(apiMocks.get).toHaveBeenCalledWith('/api/v1/payouts', {
    params: { page: 1, pageSize: 20, payoutId: PAYOUT_ID },
  }));
});
