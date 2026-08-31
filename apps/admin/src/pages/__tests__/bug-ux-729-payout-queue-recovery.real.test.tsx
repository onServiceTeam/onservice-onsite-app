import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import api from '@/lib/api';

import PayoutsPage from '../PayoutsPage';

it('Bug UX-729 — a failed payout queue stays unavailable until its local retry recovers real requests', async () => {
  vi.mocked(api.get)
    .mockRejectedValueOnce(new Error('payout source offline'))
    .mockResolvedValueOnce({ data: { success: true, data: [{
      id: 'payout-1', providerId: 'provider-1', walletId: 'wallet-1', amount: 100000,
      method: 'gcash', destinationAccount: '+63 9XX XXX 4567', accountName: null,
      status: 'pending', paymongoTransferId: null, failureReason: null, rejectionReason: null,
      notes: null, reviewedBy: null, reviewedAt: null, createdAt: '2026-08-31T00:00:00.000Z',
      completedAt: null, requiresAmlReview: false, amlThresholdAtRequest: null,
      providerBusinessName: 'Cebu Home Care',
    }], pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 } } } as never);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(<QueryClientProvider client={client}><MemoryRouter><PayoutsPage /></MemoryRouter></QueryClientProvider>);

  expect(await screen.findByText('Payout queue unavailable')).toBeVisible();
  expect(screen.queryByText('No payout requests found.')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Retry payout queue' }));
  expect(await screen.findByText('Cebu Home Care')).toBeVisible();
});
