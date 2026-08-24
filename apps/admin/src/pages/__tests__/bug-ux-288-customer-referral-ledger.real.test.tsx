import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock('@/lib/api', () => ({
  default: apiMocks,
  getErrorMessage: () => 'Request failed',
}));

import { ReferralsTab } from '../CustomerDetailPage';

it('Bug UX-288 — Customer 360 shows complete-ledger referral KPIs and labels the bounded support history', async () => {
  apiMocks.get.mockResolvedValue({
    data: {
      success: true,
      data: {
        ownCodes: [],
        given: [{
          id: 'latest', refereeId: 'friend-1', refereeName: 'Friend One', refereeBonus: 10000,
          referrerBonus: 10000, referrerCredited: true, qualifyingBookingId: 'booking-1',
          createdAt: '2026-08-25T00:00:00.000Z',
        }],
        received: null,
        totalEarnedFromReferrals: 2750000,
        totalReferrals: 250,
        creditedReferrals: 220,
        pendingReferrals: 30,
      },
    },
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={client}>
      <MemoryRouter><ReferralsTab customerId="customer-1" /></MemoryRouter>
    </QueryClientProvider>,
  );

  expect(await screen.findByText('250')).toBeVisible();
  expect(screen.getByText('30')).toBeVisible();
  expect(screen.getByText(/27,500\.00/)).toBeVisible();
  expect(screen.getByText(/latest 1 of 250 referral records/i)).toBeVisible();
  expect(screen.getByText(/complete referral ledger/i)).toBeVisible();
});
