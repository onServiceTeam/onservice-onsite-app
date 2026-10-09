import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const PAYMENT_ATTEMPT_ID = '11840000-0000-4000-8000-000000001184';
const apiMocks = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/lib/api', () => ({ default: apiMocks, getErrorMessage: () => 'Request failed' }));
vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { role: 'admin' } }),
}));

import FinancialsPage from '../FinancialsPage';

it('Bug UX-1184 - an exact payment-attempt target overrides stale payment and retry searches', async () => {
  apiMocks.get.mockResolvedValueOnce({ data: { success: true, data: {
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
    permanentGatewayFailures: 0,
    recentIntents: [],
    gatewayRetries: [],
  } } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/financials?tab=payments&paymentAttemptId=${PAYMENT_ATTEMPT_ID}&intentSearch=other&retrySearch=stale&supportCase=SUP-64`]}>
        <FinancialsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );

  await waitFor(() => expect(apiMocks.get).toHaveBeenCalledWith('/api/v1/admin/financials/payments', {
    params: { retryLimit: 25, retryOffset: 0, paymentAttemptId: PAYMENT_ATTEMPT_ID },
  }));
});
