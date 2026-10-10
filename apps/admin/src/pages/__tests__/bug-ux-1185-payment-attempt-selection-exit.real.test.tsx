import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const PAYMENT_ATTEMPT_ID = '11850000-0000-4000-8000-000000001185';
const apiMocks = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/lib/api', () => ({ default: apiMocks, getErrorMessage: () => 'Request failed' }));
vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { role: 'admin' } }),
}));

import FinancialsPage from '../FinancialsPage';

function LocationEvidence(): React.ReactElement {
  const location = useLocation();
  return <output aria-label="Current financials query">{location.search}</output>;
}

it('Bug UX-1185 - clearing exact payment evidence preserves unrelated support URL context', async () => {
  apiMocks.get.mockResolvedValue({ data: { success: true, data: {
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
      topupId: 'topup-1185',
      paymongoIntentId: 'pi_1185',
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
      <MemoryRouter initialEntries={[`/financials?tab=payments&paymentAttemptId=${PAYMENT_ATTEMPT_ID}&supportCase=SUP-65`]}>
        <LocationEvidence />
        <FinancialsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );

  fireEvent.click(await screen.findByRole('button', { name: 'Clear' }));

  expect(screen.getByLabelText('Current financials query')).toHaveTextContent('?tab=payments&supportCase=SUP-65');
});
