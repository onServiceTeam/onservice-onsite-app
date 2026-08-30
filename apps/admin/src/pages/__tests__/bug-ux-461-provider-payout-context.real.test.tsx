import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('@/lib/api', () => ({ default: apiMocks, getErrorMessage: () => 'Request failed' }));
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { role: 'admin' } }),
}));

import { FinancialsTab } from '../ProviderDetailPage';

it('Bug UX-461 — Provider 360 financials open the provider-filtered payout queue and retain payout identifiers', async () => {
  apiMocks.get.mockResolvedValueOnce({ data: { success: true, data: {
    totalEarned: 100000, totalCommissionPaid: 10000, walletAvailable: 90000, walletPending: 0,
    monthlyEarnings: [], recentPayouts: [{
      id: 'payout-12345678', amount: 50000, method: 'gcash', status: 'completed',
      createdAt: '2026-08-30T01:00:00.000Z', completedAt: '2026-08-30T02:00:00.000Z',
    }],
  } } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(<QueryClientProvider client={client}><MemoryRouter><FinancialsTab providerId="provider/id" /></MemoryRouter></QueryClientProvider>);

  expect((await screen.findByText('Open payout queue')).closest('a')).toHaveAttribute('to', '/payouts?providerId=provider%2Fid');
  expect(screen.getByText('payout-1')).toBeVisible();
});
