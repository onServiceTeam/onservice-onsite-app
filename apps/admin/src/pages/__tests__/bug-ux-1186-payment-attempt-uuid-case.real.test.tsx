import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const PAYMENT_ATTEMPT_ID = '11860000-0000-4abc-8def-000000001186';
const apiMocks = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/lib/api', () => ({ default: apiMocks, getErrorMessage: () => 'Request failed' }));
vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { role: 'admin' } }),
}));

import FinancialsPage from '../FinancialsPage';

it('Bug UX-1186 - a valid uppercase payment-attempt UUID resolves to the canonical exact record', async () => {
  apiMocks.get.mockResolvedValueOnce({ data: { success: true, data: {
    paymentIntentsAvailable: true,
    gatewayRetriesAvailable: true,
    totalAttempts: 1,
    awaitingPaymentCount: 0,
    processingCount: 0,
    succeededCount: 1,
    failedCount: 0,
    refundedCount: 0,
    partiallyRefundedCount: 0,
    pendingGatewayRetries: 0,
    inProgressGatewayRetries: 0,
    permanentGatewayFailures: 0,
    recentIntents: [{
      id: PAYMENT_ATTEMPT_ID,
      bookingId: null,
      topupId: 'topup-1186',
      paymongoIntentId: 'pi_1186',
      paymongoPaymentId: null,
      customerId: null,
      customerName: null,
      amountCentavos: 50000,
      refundedAmountCentavos: 0,
      paymentMethod: 'gcash',
      status: 'succeeded',
      createdAt: '2026-09-03T12:00:00.000Z',
      updatedAt: '2026-09-03T12:01:00.000Z',
    }],
    gatewayRetries: [],
  } } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/financials?tab=payments&paymentAttemptId=${PAYMENT_ATTEMPT_ID.toUpperCase()}`]}>
        <FinancialsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );

  expect(await screen.findByText('Gateway intent pi_1186')).toBeVisible();
  expect(screen.queryByRole('heading', { name: 'Payment attempt not found' })).not.toBeInTheDocument();
  await waitFor(() => expect(apiMocks.get).toHaveBeenCalledWith('/api/v1/admin/financials/payments', {
    params: { retryLimit: 25, retryOffset: 0, paymentAttemptId: PAYMENT_ATTEMPT_ID },
  }));
});
