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
    data: [{
      id: payoutId,
      providerId: '77777777-7777-4777-8777-777777777777',
      walletId: '88888888-8888-4888-8888-888888888888',
      amount: 50000,
      method: 'gcash',
      destinationAccount: '09*******67',
      accountName: 'Paolo S.',
      status: 'completed',
      paymongoTransferId: null,
      failureReason: null,
      rejectionReason: null,
      notes: null,
      reviewedBy: null,
      reviewedAt: null,
      createdAt: '2026-09-03T09:00:00.000Z',
      completedAt: '2026-09-03T10:00:00.000Z',
      requiresAmlReview: false,
      amlThresholdAtRequest: null,
      providerBusinessName: 'Cebu Cleaners',
    }],
    pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
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
