import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

import api from '@/lib/api';
import FinancialsPage from '../FinancialsPage';

vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));

it('Bug UX-1043 — a gateway retry opens the exact dispute that authorized its money remedy', async () => {
  vi.mocked(api.get).mockResolvedValue({ data: { success: true, data: {
    paymentIntentsAvailable: true,
    gatewayRetriesAvailable: true,
    totalAttempts: 0,
    awaitingPaymentCount: 0,
    processingCount: 0,
    succeededCount: 0,
    failedCount: 0,
    refundedCount: 0,
    partiallyRefundedCount: 0,
    pendingGatewayRetries: 1,
    inProgressGatewayRetries: 0,
    permanentGatewayFailures: 0,
    recentIntents: [],
    gatewayRetries: [{
      id: '14300000-0000-4000-8000-000000001043',
      bookingId: '24300000-0000-4000-8000-000000001043',
      disputeId: '34300000-0000-4000-8000-000000001043',
      actionType: 'refund_from_escrow',
      amountCentavos: 25000,
      status: 'pending',
      attempts: 1,
      maxAttempts: 5,
      nextRetryAt: '2026-09-03T02:00:00.000Z',
      lastAttemptedAt: '2026-09-03T01:00:00.000Z',
      lastError: null,
    }],
  } } } as never);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/financials?tab=payments']}><FinancialsPage /></MemoryRouter>
    </QueryClientProvider>,
  );

  expect(await screen.findByRole('link', { name: 'Open Dispute 360' })).toHaveAttribute(
    'href', '/disputes/34300000-0000-4000-8000-000000001043',
  );
});
