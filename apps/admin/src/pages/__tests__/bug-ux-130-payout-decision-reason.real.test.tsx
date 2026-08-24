import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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

it('Bug UX-130 — approving a payout requires and submits a specific audit reason', async () => {
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  vi.mocked(api.get).mockResolvedValueOnce({
    data: {
      success: true,
      data: [{
        id: 'payout-1', providerId: 'provider-1', walletId: 'wallet-1', amount: 25_000,
        method: 'gcash', destinationAccount: '09171234567', accountName: 'Maria Santos', status: 'pending',
        paymongoTransferId: null, failureReason: null, rejectionReason: null, notes: null,
        reviewedBy: null, reviewedAt: null, createdAt: '2026-08-24T00:00:00.000Z', completedAt: null,
        providerBusinessName: 'Cebu Home Care', requiresAmlReview: false, amlThresholdAtRequest: null,
      }],
      pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
    },
  } as never);
  vi.mocked(api.put).mockResolvedValueOnce({ data: { success: true } } as never);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter><PayoutsPage /></MemoryRouter>
    </QueryClientProvider>,
  );

  fireEvent.click(await screen.findByRole('button', { name: 'Approve payout payout-1' }));
  const dialog = screen.getByRole('dialog', { name: 'Approve Payout' });
  const confirmButton = within(dialog).getByRole('button', { name: 'Approve' });
  expect(confirmButton).toBeDisabled();
  fireEvent.change(within(dialog).getByLabelText('Audit Reason *'), {
    target: { value: 'Verified identity, destination, and wallet reservation.' },
  });
  expect(confirmButton).toBeEnabled();
  fireEvent.click(confirmButton);

  await waitFor(() => expect(api.put).toHaveBeenCalledWith('/api/v1/payouts/payout-1/approve', {
    reason: 'Verified identity, destination, and wallet reservation.',
  }));
});
