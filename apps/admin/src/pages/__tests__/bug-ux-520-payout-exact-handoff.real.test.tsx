import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const payoutId = '66666666-6666-4666-8666-666666666666';
const setSearchParamsMock = vi.hoisted(() => vi.fn());
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('react-router-dom');
  return { ...actual, useSearchParams: () => [new URLSearchParams(`payoutId=${payoutId}`), setSearchParamsMock] };
});

const apiMocks = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn() }));
vi.mock('@/lib/api', () => ({ default: apiMocks, getErrorMessage: () => 'Request failed' }));

import PayoutsPage from '../PayoutsPage';

it('Bug UX-520 — a global payout result opens a visibly exact read-only queue filter', async () => {
  apiMocks.get.mockResolvedValueOnce({ data: {
    success: true,
    data: [],
    pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
  } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={client}>
      <MemoryRouter><PayoutsPage /></MemoryRouter>
    </QueryClientProvider>,
  );

  expect(screen.getByText(/Exact payout/i)).toBeVisible();
  expect(screen.getByText('66666666')).toBeVisible();
  await waitFor(() => expect(apiMocks.get).toHaveBeenCalledWith('/api/v1/payouts', {
    params: { page: 1, pageSize: 20, payoutId },
  }));
  expect(screen.getByRole('button', { name: 'Clear' })).toBeVisible();
});
