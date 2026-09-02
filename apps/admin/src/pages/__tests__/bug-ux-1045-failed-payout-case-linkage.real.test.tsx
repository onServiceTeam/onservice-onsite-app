import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

import api from '@/lib/api';
import { PayoutsPanel } from '../FinancialsPage';

it('Bug UX-1045 — a failed payout opens its exact payout record and provider case', async () => {
  vi.mocked(api.get).mockResolvedValue({ data: { success: true, data: {
    available: true,
    message: null,
    pendingCount: 1,
    pendingTotalCentavos: 125000,
    internalReviewCount: 0,
    awaitingApprovalCount: 0,
    approvedAwaitingTransferCount: 0,
    processingCount: 0,
    todayCompletedCount: 0,
    todayCompletedCentavos: 0,
    failedCount: 1,
    recentFailed: [{
      id: '14500000-0000-4000-8000-000000001045',
      providerId: '24500000-0000-4000-8000-000000001045',
      providerName: 'Failed Payout Provider',
      amountCentavos: 125000,
      failedAt: '2026-09-03T03:00:00.000Z',
      failureReason: 'External transfer rejected',
    }],
  } } } as never);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={client}>
      <MemoryRouter><PayoutsPanel /></MemoryRouter>
    </QueryClientProvider>,
  );

  expect(await screen.findByLabelText('Open payout 14500000-0000-4000-8000-000000001045')).toHaveAttribute(
    'href', '/payouts?payoutId=14500000-0000-4000-8000-000000001045',
  );
  expect(screen.getByRole('link', { name: 'Failed Payout Provider' })).toHaveAttribute(
    'href', '/providers/24500000-0000-4000-8000-000000001045',
  );
});
