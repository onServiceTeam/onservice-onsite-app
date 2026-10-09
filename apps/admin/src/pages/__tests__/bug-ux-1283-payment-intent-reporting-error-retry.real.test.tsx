import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const apiGet = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', () => ({ default: { get: apiGet }, getErrorMessage: (error: Error) => error.message }));

import { PaymentsPanel } from '../FinancialsPage';

const props = {
  paymentAttemptId: '', paymentAttemptSelectionError: '', onClearExactPaymentAttempt: vi.fn(),
  intentSearch: '', onIntentSearchChange: vi.fn(), retrySearch: '', onRetrySearchChange: vi.fn(),
};

it('Bug UX-1283 - unavailable payment-intent reporting offers recovery without implying a clear payment queue', async () => {
  apiGet
    .mockResolvedValueOnce({ data: { success: true, data: {
      paymentIntentsAvailable: false, gatewayRetriesAvailable: true,
      totalAttempts: 0, awaitingPaymentCount: 0, processingCount: 0, succeededCount: 0,
      failedCount: 0, refundedCount: 0, partiallyRefundedCount: 0, pendingGatewayRetries: 0,
      inProgressGatewayRetries: 0, permanentGatewayFailures: 0, recentIntents: [], gatewayRetries: [],
    } } })
    .mockResolvedValueOnce({ data: { success: true, data: {
      paymentIntentsAvailable: true, gatewayRetriesAvailable: true,
      totalAttempts: 0, awaitingPaymentCount: 0, processingCount: 0, succeededCount: 0,
      failedCount: 0, refundedCount: 0, partiallyRefundedCount: 0, pendingGatewayRetries: 0,
      inProgressGatewayRetries: 0, permanentGatewayFailures: 0, recentIntents: [], gatewayRetries: [],
    } } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><MemoryRouter><PaymentsPanel {...props} /></MemoryRouter></QueryClientProvider>);

  expect(await screen.findByRole('heading', { name: 'Payment intent reporting unavailable' })).toBeInTheDocument();
  expect(screen.getByText(/do not treat the payment queue as clear/i)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Retry payment reporting' }));

  await waitFor(() => expect(apiGet).toHaveBeenCalledTimes(2));
  expect(await screen.findByText('No payment attempts recorded')).toBeInTheDocument();
});
