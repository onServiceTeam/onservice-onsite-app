import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const PAYOUT_ID = '11770000-0000-4000-8000-000000001177';
const apiMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('@/lib/api', () => ({ default: apiMocks, getErrorMessage: () => 'Request failed' }));
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { role: 'admin' } }),
}));

import { FinancialsTab } from '../ProviderDetailPage';

it('Bug UX-1177 — a Provider 360 recent payout opens that exact payout operations record', async () => {
  apiMocks.get.mockResolvedValueOnce({ data: { success: true, data: {
    totalEarned: 100000,
    totalCommissionPaid: 10000,
    walletAvailable: 90000,
    walletPending: 0,
    monthlyEarnings: [],
    recentPayouts: [{
      id: PAYOUT_ID,
      amount: 50000,
      method: 'gcash',
      status: 'completed',
      createdAt: '2026-09-03T09:00:00.000Z',
      completedAt: '2026-09-03T10:00:00.000Z',
    }],
  } } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={client}>
      <MemoryRouter><FinancialsTab providerId="provider-1" /></MemoryRouter>
    </QueryClientProvider>,
  );

  expect(await screen.findByRole('link', { name: `Open payout ${PAYOUT_ID}` })).toHaveAttribute(
    'href',
    `/payouts?payoutId=${PAYOUT_ID}`,
  );
});
