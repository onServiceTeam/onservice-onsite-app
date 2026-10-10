import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const TRANSACTION_ID = '41620000-0000-4000-8000-000000001162';
const apiMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('@/lib/api', () => ({ default: apiMocks, getErrorMessage: () => 'Request failed' }));

import { PaymentsTab } from '../CustomerDetailPage';

it('Bug UX-1162 — an exact Customer 360 wallet link requests and selects only the customer-owned ledger row', async () => {
  apiMocks.get.mockResolvedValue({ data: { success: true, data: {
    walletAvailable: 12500,
    walletPending: 0,
    recentTransactions: [{
      id: TRANSACTION_ID,
      type: 'adjustment',
      amount: 12500,
      balanceAfter: 12500,
      description: 'Service recovery credit',
      bookingId: null,
      createdAt: '2026-09-03T06:00:00.000Z',
    }],
    recentPaymentIntents: [],
    paymentMethodCounts: {},
  } } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <PaymentsTab customerId="customer-1" exactTransactionId={TRANSACTION_ID} />
      </MemoryRouter>
    </QueryClientProvider>,
  );

  expect(await screen.findByText('Exact customer wallet transaction')).toBeVisible();
  expect(screen.getByText('Service recovery credit').closest('tr')).toHaveAttribute('aria-current', 'true');
  expect(screen.queryByText('Adjust customer wallet')).not.toBeInTheDocument();
  expect(screen.queryByText('Recent payment intents')).not.toBeInTheDocument();
  expect(apiMocks.get).toHaveBeenCalledWith(
    '/api/v1/admin/customers/customer-1/payments',
    { params: { transactionId: TRANSACTION_ID } },
  );
});
