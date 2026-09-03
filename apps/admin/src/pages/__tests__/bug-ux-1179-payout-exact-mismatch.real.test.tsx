import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const PAYOUT_ID = '11790000-0000-4000-8000-000000001179';
const apiMocks = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn() }));
vi.mock('@/lib/api', () => ({ default: apiMocks, getErrorMessage: () => 'Request failed' }));
vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { role: 'admin' } }),
}));

import PayoutsPage from '../PayoutsPage';

it('Bug UX-1179 — exact payout mode refuses to show a mismatched payout as substitute evidence', async () => {
  apiMocks.get.mockResolvedValueOnce({ data: {
    success: true,
    data: [{
      id: '21790000-0000-4000-8000-000000001179',
      providerId: '31790000-0000-4000-8000-000000001179',
      walletId: '41790000-0000-4000-8000-000000001179',
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
      providerBusinessName: 'Wrong Provider',
    }],
    pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
  } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/payouts?payoutId=${PAYOUT_ID}`]}>
        <PayoutsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );

  expect(await screen.findByRole('alert')).toHaveTextContent('No substitute payout is shown');
  expect(screen.queryByText('Wrong Provider')).not.toBeInTheDocument();
});
