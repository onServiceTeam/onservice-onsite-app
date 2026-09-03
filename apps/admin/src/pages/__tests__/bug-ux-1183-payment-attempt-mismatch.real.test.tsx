import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const PAYMENT_ATTEMPT_ID = '11830000-0000-4000-8000-000000001183';
const apiMocks = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/lib/api', () => ({ default: apiMocks, getErrorMessage: () => 'Request failed' }));
vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { role: 'admin' } }),
}));

import FinancialsPage from '../FinancialsPage';

it('Bug UX-1183 - exact payment evidence refuses to render a mismatched attempt as a substitute', async () => {
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
      id: '21830000-0000-4000-8000-000000001183',
      bookingId: '31830000-0000-4000-8000-000000001183',
      topupId: null,
      paymongoIntentId: 'pi_wrong_1183',
      paymongoPaymentId: null,
      customerId: '41830000-0000-4000-8000-000000001183',
      customerName: 'Wrong Payment Customer',
      amountCentavos: 125000,
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
      <MemoryRouter initialEntries={[`/financials?tab=payments&paymentAttemptId=${PAYMENT_ATTEMPT_ID}`]}>
        <FinancialsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );

  const heading = await screen.findByRole('heading', { name: 'Payment attempt not found' });
  expect(heading.closest('[role="alert"]')).toHaveTextContent('No substitute payment record is shown');
  expect(screen.queryByText('Wrong Payment Customer')).not.toBeInTheDocument();
});
