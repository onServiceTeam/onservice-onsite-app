import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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

it('Bug UX-1048 — recording a payout as sent uses one truthful in-app confirmation', async () => {
  const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
  vi.mocked(api.get).mockResolvedValue({
    data: {
      success: true,
      data: [{
        id: '10480000-0000-4000-8000-000000000001',
        providerId: '10480000-0000-4000-8000-000000000002',
        walletId: '10480000-0000-4000-8000-000000000003',
        amount: 250000,
        method: 'bank_instapay',
        destinationAccount: '••••4567',
        accountName: 'Escrow Provider',
        status: 'approved',
        paymongoTransferId: null,
        failureReason: null,
        rejectionReason: null,
        notes: null,
        reviewedBy: null,
        reviewedAt: null,
        createdAt: '2026-09-03T00:00:00.000Z',
        completedAt: null,
        requiresAmlReview: false,
        amlThresholdAtRequest: null,
        providerBusinessName: 'Escrow Provider',
      }],
      pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
    },
  } as never);
  vi.mocked(api.put).mockResolvedValue({ data: { success: true } } as never);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={client}>
      <MemoryRouter><PayoutsPage /></MemoryRouter>
    </QueryClientProvider>,
  );

  fireEvent.click(await screen.findByRole('button', { name: 'Record payout 10480000-0000-4000-8000-000000000001 as sent' }));
  const dialog = screen.getByRole('dialog', { name: 'Record Payout as Sent' });
  expect(within(dialog).getByText(/It does not initiate or send the transfer/)).toBeVisible();
  fireEvent.change(within(dialog).getByLabelText('Audit Reason *'), {
    target: { value: 'Verified external bank transfer against the batch record.' },
  });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Record as Sent' }));

  await waitFor(() => expect(api.put).toHaveBeenCalledWith(
    '/api/v1/payouts/10480000-0000-4000-8000-000000000001/complete',
    { paymongoTransferId: undefined, reason: 'Verified external bank transfer against the batch record.' },
  ));
  expect(confirmSpy).not.toHaveBeenCalled();
});
