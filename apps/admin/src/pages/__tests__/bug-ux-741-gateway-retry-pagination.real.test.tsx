import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import api from '@/lib/api';

vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));

import FinancialsPage from '../FinancialsPage';

it('Bug UX-741 — finance can paginate beyond the first page of unresolved gateway retries', async () => {
  vi.mocked(api.get).mockResolvedValueOnce({ data: { success: true, data: {
    paymentIntentsAvailable: true, gatewayRetriesAvailable: true,
    totalAttempts: 0, awaitingPaymentCount: 0, processingCount: 0, succeededCount: 0,
    failedCount: 0, refundedCount: 0, partiallyRefundedCount: 0,
    pendingGatewayRetries: 30, inProgressGatewayRetries: 0, permanentGatewayFailures: 0,
    recentIntents: [],
    gatewayRetries: [{
      id: 'retry-1', bookingId: 'booking-1', disputeId: null, actionType: 'refund_from_escrow',
      amountCentavos: 25000, status: 'pending', attempts: 1, maxAttempts: 5,
      nextRetryAt: '2026-08-31T03:00:00.000Z', lastAttemptedAt: null, lastError: null,
    }],
  } } } as never);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/financials?tab=payments']}><FinancialsPage /></MemoryRouter></QueryClientProvider>);

  expect(await screen.findByText(/Showing 1–25 of 30/)).toBeVisible();
  expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled();
  expect(api.get).toHaveBeenCalledWith('/api/v1/admin/financials/payments', {
    params: { retryLimit: 25, retryOffset: 0 },
  });
});
