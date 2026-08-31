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

it('BUG-UX-185 — AML review shows the captured threshold and does not imply a legal report', async () => {
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

  expect(await screen.findByText(/Internal review hold at ₱500,000.00/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /clear internal review hold for payout payout-aml-1/i }));
  expect(screen.getByText(/does not state that a legal report was filed or required/i)).toBeTruthy();
  expect(screen.getByText(/Threshold captured when requested: ₱500,000.00/)).toBeTruthy();
});
