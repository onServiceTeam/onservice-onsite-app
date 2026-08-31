import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import api from '@/lib/api';

import PayoutsPage from '../PayoutsPage';

it('Bug UX-735 — manual payout completion accepts a method-neutral external transfer reference', async () => {
  vi.mocked(api.get).mockResolvedValueOnce({ data: {
    success: true,
    data: [{
      id: '11111111-1111-4111-8111-111111111111', providerId: 'provider-1', walletId: 'wallet-1',
      amount: 100000, method: 'bank_instapay', destinationAccount: '••••4567', accountName: null,
      status: 'approved', paymongoTransferId: null, failureReason: null, rejectionReason: null,
      notes: null, reviewedBy: null, reviewedAt: null, createdAt: '2026-08-31T00:00:00.000Z',
      completedAt: null, requiresAmlReview: false, amlThresholdAtRequest: null,
      providerBusinessName: 'Cebu Home Care',
    }],
    pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
  } } as never);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(<QueryClientProvider client={client}><MemoryRouter><PayoutsPage /></MemoryRouter></QueryClientProvider>);

  fireEvent.click(await screen.findByRole('button', { name: /complete payout/i }));
  expect(screen.getByLabelText('External Transfer Reference (optional, max 100 chars)')).toHaveAttribute(
    'placeholder',
    'Bank, wallet, or gateway reference',
  );
  expect(screen.getByLabelText('External Transfer Reference (optional, max 100 chars)')).toHaveAttribute('maxlength', '100');
  expect(screen.queryByText(/PayMongo Transfer ID/i)).not.toBeInTheDocument();
});
