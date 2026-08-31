import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

vi.mock('@/lib/api', () => ({
  default: { get: vi.fn(), put: vi.fn() },
  getErrorMessage: vi.fn(() => 'Request failed'),
}));
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { role: 'super_admin' } }),
}));

import api from '@/lib/api';
import PayoutsPage from '../PayoutsPage';

it('Bug UX-132 — an internal-review-held payout offers direct rejection with a required written reason', async () => {
  vi.mocked(api.get).mockResolvedValueOnce({
    data: {
      success: true,
      data: [{
        id: 'payout-aml-1', providerId: 'provider-1', walletId: 'wallet-1', amount: 50_000_000,
        method: 'gcash', destinationAccount: '09171234567', accountName: 'Maria Santos',
        status: 'aml_review_pending', paymongoTransferId: null, failureReason: null,
        rejectionReason: null, notes: null, reviewedBy: null, reviewedAt: null,
        createdAt: '2026-08-24T00:00:00.000Z', completedAt: null,
        providerBusinessName: 'Cebu Home Care', requiresAmlReview: true,
        amlThresholdAtRequest: 50_000_000,
      }],
      pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
    },
  } as never);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter><PayoutsPage /></MemoryRouter>
    </QueryClientProvider>,
  );

  fireEvent.click(await screen.findByRole('button', { name: 'Reject internal-review-held payout payout-aml-1' }));
  const submit = screen.getByRole('button', { name: 'Reject' });
  expect(submit).toBeDisabled();
  expect(screen.getByLabelText('Rejection Reason *')).toBeTruthy();
});
