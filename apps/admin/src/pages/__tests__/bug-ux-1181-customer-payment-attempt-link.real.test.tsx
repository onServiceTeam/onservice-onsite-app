import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const PAYMENT_ATTEMPT_ID = '11810000-0000-4000-8000-000000001181';
const apiMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('@/lib/api', () => ({ default: apiMocks, getErrorMessage: () => 'Request failed' }));
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { role: 'admin' } }),
}));

import { PaymentsTab } from '../CustomerDetailPage';

it('Bug UX-1181 - a Customer 360 payment attempt opens its exact Financials evidence record', async () => {
  apiMocks.get.mockResolvedValueOnce({ data: { success: true, data: {
    walletAvailable: 0,
    walletPending: 0,
    recentTransactions: [],
    recentPaymentIntents: [{
      id: PAYMENT_ATTEMPT_ID,
      bookingId: '21810000-0000-4000-8000-000000001181',
      providerId: '31810000-0000-4000-8000-000000001181',
      paymentMethod: 'gcash',
      status: 'succeeded',
      amount: 125000,
      createdAt: '2026-09-03T12:00:00.000Z',
    }],
    paymentMethodCounts: { gcash: 1 },
  } } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={client}>
      <MemoryRouter><PaymentsTab customerId="customer-1" /></MemoryRouter>
    </QueryClientProvider>,
  );

  expect(await screen.findByRole('link', { name: `Open payment attempt ${PAYMENT_ATTEMPT_ID}` })).toHaveAttribute(
    'href',
    `/financials?tab=payments&paymentAttemptId=${PAYMENT_ATTEMPT_ID}`,
  );
  expect(screen.getByRole('columnheader', { name: 'Attempt' })).toBeVisible();
  expect(screen.getAllByRole('columnheader')).toHaveLength(7);
  expect(screen.getByRole('row', { name: new RegExp(PAYMENT_ATTEMPT_ID.slice(0, 8)) }).children).toHaveLength(7);
});
