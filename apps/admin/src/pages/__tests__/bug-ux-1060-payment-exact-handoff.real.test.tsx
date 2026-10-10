import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

import api from '@/lib/api';
import FinancialsPage from '../FinancialsPage';

vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));

it('Bug UX-1060 - a payment handoff URL restores and runs the exact attempt search', async () => {
  vi.mocked(api.get).mockResolvedValueOnce({ data: { success: true, data: {
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
      id: '39700000-0000-4000-8000-000000000397',
      bookingId: '39700000-0000-4000-8000-000000003970',
      topupId: null,
      paymongoIntentId: 'pi_private_ux_1060',
      paymongoPaymentId: 'pay_private_ux_1060',
      customerId: '39700000-0000-4000-8000-000000039700',
      customerName: 'Payment Customer',
      amountCentavos: 125000,
      refundedAmountCentavos: 0,
      paymentMethod: 'gcash',
      status: 'succeeded',
      createdAt: '2026-09-03T03:00:00.000Z',
      updatedAt: '2026-09-03T03:01:00.000Z',
    }],
    gatewayRetries: [],
  } } } as never);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/financials?tab=payments&paymentAttemptId=39700000-0000-4000-8000-000000000397']}>
        <FinancialsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );

  expect(await screen.findByText('39700000-0000-4000-8000-000000000397')).toBeVisible();
  expect(await screen.findByText('Gateway intent pi_private_ux_1060')).toBeVisible();
  expect(api.get).toHaveBeenCalledWith('/api/v1/admin/financials/payments', {
    params: {
      retryLimit: 25,
      retryOffset: 0,
      paymentAttemptId: '39700000-0000-4000-8000-000000000397',
    },
  });
});
