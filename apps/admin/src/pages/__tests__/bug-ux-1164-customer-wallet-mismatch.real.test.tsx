import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('@/lib/api', () => ({ default: apiMocks, getErrorMessage: () => 'Request failed' }));

import { PaymentsTab } from '../CustomerDetailPage';

it('Bug UX-1164 — Customer 360 refuses to substitute a mismatched wallet row for exact audit evidence', async () => {
  apiMocks.get.mockResolvedValue({ data: { success: true, data: {
    walletAvailable: 12500,
    walletPending: 0,
    recentTransactions: [{
      id: '51640000-0000-4000-8000-000000001164',
      type: 'adjustment',
      amount: 12500,
      balanceAfter: 12500,
      description: 'Different wallet transaction',
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
        <PaymentsTab
          customerId="customer-1"
          exactTransactionId="61640000-0000-4000-8000-000000001164"
        />
      </MemoryRouter>
    </QueryClientProvider>,
  );

  expect(await screen.findByRole('alert')).toHaveTextContent('No substitute transaction is shown');
  expect(screen.queryByText('Different wallet transaction')).not.toBeInTheDocument();
  expect(screen.queryByText('Exact customer wallet transaction')).not.toBeInTheDocument();
});
