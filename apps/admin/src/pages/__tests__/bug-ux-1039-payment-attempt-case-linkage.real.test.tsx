import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const apiGet = vi.hoisted(() => vi.fn(() => Promise.resolve({
  data: {
    data: {
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
        id: '13900000-0000-4000-8000-000000001039',
        bookingId: '23900000-0000-4000-8000-000000001039',
        topupId: null,
        customerId: '33900000-0000-4000-8000-000000001039',
        customerName: 'Customer Payment 1039',
        amountCentavos: 125000,
        refundedAmountCentavos: 0,
        paymentMethod: 'wallet',
        status: 'succeeded',
        createdAt: '2026-09-03T00:00:00.000Z',
        updatedAt: '2026-09-03T00:01:00.000Z',
      }],
      gatewayRetries: [],
    },
  },
})));

vi.mock('@/lib/api', () => ({
  default: { get: apiGet },
  getErrorMessage: (error: unknown) => error instanceof Error ? error.message : 'Request failed',
}));

import FinancialsPage from '../FinancialsPage';

it('Bug UX-1039 — a payment attempt identifies its exact record and opens Booking 360 and Customer 360', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/financials?tab=payments']}><FinancialsPage /></MemoryRouter>
    </QueryClientProvider>,
  );

  expect(await screen.findByText('Attempt 13900000-0000-4000-8000-000000001039')).toBeVisible();
  expect(screen.getByRole('link', { name: 'Booking 23900000' })).toHaveAttribute(
    'href', '/bookings/23900000-0000-4000-8000-000000001039',
  );
  expect(screen.getByRole('link', { name: 'Customer Payment 1039' })).toHaveAttribute(
    'href', '/customers/33900000-0000-4000-8000-000000001039',
  );
});
