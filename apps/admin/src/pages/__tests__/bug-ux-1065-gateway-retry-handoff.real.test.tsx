import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

import api from '@/lib/api';
import FinancialsPage from '../FinancialsPage';

vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));

it('Bug UX-1065 - a gateway retry handoff URL restores its exact auditable queue record', async () => {
  vi.mocked(api.get).mockResolvedValueOnce({ data: { success: true, data: {
    paymentIntentsAvailable: true,
    gatewayRetriesAvailable: true,
    totalAttempts: 0,
    awaitingPaymentCount: 0,
    processingCount: 0,
    succeededCount: 0,
    failedCount: 0,
    refundedCount: 0,
    partiallyRefundedCount: 0,
    pendingGatewayRetries: 0,
    inProgressGatewayRetries: 0,
    permanentGatewayFailures: 1,
    recentIntents: [],
    gatewayRetries: [{
      id: '39900000-0000-4000-8000-000000000399',
      bookingId: '39900000-0000-4000-8000-000000003990',
      disputeId: null,
      actionType: 'refund_from_escrow',
      amountCentavos: 42000,
      status: 'failed_permanent',
      attempts: 5,
      maxAttempts: 5,
      nextRetryAt: '2026-09-03T06:00:00.000Z',
      lastAttemptedAt: '2026-09-03T05:30:00.000Z',
      lastError: 'gateway unavailable',
    }],
  } } } as never);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/financials?tab=payments&retrySearch=39900000-0000-4000-8000-000000000399']}>
        <FinancialsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );

  expect(await screen.findByDisplayValue('39900000-0000-4000-8000-000000000399')).toBeVisible();
  expect(await screen.findByText('Retry 39900000-0000-4000-8000-000000000399')).toBeVisible();
  expect(screen.getByText('Exact retry identifier matches')).toBeVisible();
  expect(api.get).toHaveBeenCalledWith('/api/v1/admin/financials/payments', {
    params: {
      retryLimit: 25,
      retryOffset: 0,
      retrySearch: '39900000-0000-4000-8000-000000000399',
    },
  });
});
