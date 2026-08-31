import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import api from '@/lib/api';

vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));

vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { role: 'super_admin' } }),
}));

import FinancialsPage from '../FinancialsPage';

it('Bug UX-727 — finance sees payment attempt truth and unresolved refund retries in one workspace', async () => {
  vi.mocked(api.get).mockResolvedValueOnce({ data: { success: true, data: {
    paymentIntentsAvailable: true, gatewayRetriesAvailable: true,
    totalAttempts: 8, awaitingPaymentCount: 2, processingCount: 1, succeededCount: 2,
    failedCount: 1, refundedCount: 1, partiallyRefundedCount: 1,
    pendingGatewayRetries: 1, inProgressGatewayRetries: 0, permanentGatewayFailures: 1,
    recentIntents: [{
      id: 'intent-1', bookingId: 'booking-1', topupId: null, customerName: 'Maria Santos',
      amountCentavos: 100000, refundedAmountCentavos: 25000, paymentMethod: 'gcash',
      status: 'partially_refunded', createdAt: '2026-08-30T01:00:00.000Z', updatedAt: '2026-08-30T02:00:00.000Z',
    }],
    gatewayRetries: [{
      id: 'retry-1', bookingId: 'booking-1', disputeId: null, actionType: 'refund_from_escrow',
      amountCentavos: 25000, status: 'failed_permanent', attempts: 5, maxAttempts: 5,
      nextRetryAt: '2026-08-30T03:00:00.000Z', lastAttemptedAt: '2026-08-30T02:30:00.000Z',
      lastError: 'gateway unavailable',
    }],
  } } } as never);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/financials?tab=payments']}><FinancialsPage /></MemoryRouter></QueryClientProvider>);

  expect(await screen.findByText(/External checkout remains on launch hold/)).toBeVisible();
  expect(screen.getByText('Latest 50 Payment Attempts')).toBeVisible();
  expect(screen.getByText('Maria Santos')).toBeVisible();
  expect(screen.getByText('Manual investigation required')).toBeVisible();
  expect(screen.getByText('gateway unavailable')).toBeVisible();
});
