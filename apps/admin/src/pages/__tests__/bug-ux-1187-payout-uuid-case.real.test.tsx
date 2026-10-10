import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const PAYOUT_ID = '11870000-0000-4abc-8def-000000001187';
const apiMocks = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn() }));
vi.mock('@/lib/api', () => ({ default: apiMocks, getErrorMessage: () => 'Request failed' }));
vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { role: 'admin' } }),
}));

import PayoutsPage from '../PayoutsPage';

it('Bug UX-1187 - a valid uppercase payout UUID resolves to the canonical exact record', async () => {
  apiMocks.get.mockResolvedValueOnce({ data: {
    success: true,
    data: [{
      id: PAYOUT_ID,
      providerId: '21870000-0000-4000-8000-000000001187',
      walletId: '31870000-0000-4000-8000-000000001187',
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
      createdAt: '2026-09-03T12:00:00.000Z',
      completedAt: '2026-09-03T12:01:00.000Z',
      requiresAmlReview: false,
      amlThresholdAtRequest: null,
      providerBusinessName: 'Canonical Payout Provider',
    }],
    pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
  } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/payouts?payoutId=${PAYOUT_ID.toUpperCase()}`]}>
        <PayoutsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );

  expect(await screen.findByText('Canonical Payout Provider')).toBeVisible();
  expect(screen.queryByText('Payout record not found')).not.toBeInTheDocument();
  await waitFor(() => expect(apiMocks.get).toHaveBeenCalledWith('/api/v1/payouts', {
    params: { page: 1, pageSize: 20, payoutId: PAYOUT_ID },
  }));
});
