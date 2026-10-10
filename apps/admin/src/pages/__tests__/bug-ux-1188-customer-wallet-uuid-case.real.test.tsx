import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const TRANSACTION_ID = '11880000-0000-4abc-8def-000000001188';
const apiMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('@/lib/api', () => ({ default: apiMocks, getErrorMessage: () => 'Request failed' }));
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { role: 'admin' } }),
}));

import { PaymentsTab } from '../CustomerDetailPage';

it('Bug UX-1188 - a valid uppercase customer wallet UUID resolves to the canonical exact transaction', async () => {
  apiMocks.get.mockResolvedValueOnce({ data: { success: true, data: {
    walletAvailable: 12500,
    walletPending: 0,
    recentTransactions: [{
      id: TRANSACTION_ID,
      type: 'adjustment',
      amount: 12500,
      balanceAfter: 12500,
      description: 'Canonical wallet transaction',
      bookingId: null,
      createdAt: '2026-09-03T12:00:00.000Z',
    }],
    recentPaymentIntents: [],
    paymentMethodCounts: {},
  } } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <PaymentsTab customerId="customer-1" exactTransactionId={TRANSACTION_ID.toUpperCase()} />
      </MemoryRouter>
    </QueryClientProvider>,
  );

  const transaction = await screen.findByText('Canonical wallet transaction');
  expect(transaction.closest('tr')).toHaveAttribute('aria-current', 'true');
  expect(apiMocks.get).toHaveBeenCalledWith('/api/v1/admin/customers/customer-1/payments', {
    params: { transactionId: TRANSACTION_ID },
  });
});
