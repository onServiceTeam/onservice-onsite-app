import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock('@/lib/api', () => ({ default: apiMocks, getErrorMessage: () => 'Request failed' }));

import { ReferralsTab } from '../CustomerDetailPage';

it('Bug UX-447 — referral history links the referring customer, referred customer, and qualifying booking to canonical support records', async () => {
  apiMocks.get.mockResolvedValueOnce({ data: { success: true, data: {
    ownCodes: [],
    given: [{
      id: 'redemption-1', refereeId: 'customer-friend-1', refereeName: 'Mia Cruz',
      refereeBonus: 5000, referrerBonus: 5000, referrerCredited: true,
      qualifyingBookingId: 'booking-referral-1', createdAt: '2026-08-20T00:00:00.000Z',
    }],
    received: {
      id: 'redemption-2', referrerId: 'customer-referrer-1', referrerName: 'Lito Reyes',
      refereeBonus: 5000, refereeCredited: true, createdAt: '2026-01-01T00:00:00.000Z',
    },
    totalEarnedFromReferrals: 5000, totalReferrals: 1, creditedReferrals: 1, pendingReferrals: 0,
  } } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={client}>
      <MemoryRouter><ReferralsTab customerId="customer-1" /></MemoryRouter>
    </QueryClientProvider>,
  );

  expect(await screen.findByLabelText('Open referring customer customer-referrer-1')).toHaveAttribute('to', '/customers/customer-referrer-1');
  expect(screen.getByLabelText('Open referred customer customer-friend-1')).toHaveAttribute('to', '/customers/customer-friend-1');
  expect(screen.getByLabelText('Open qualifying booking booking-referral-1')).toHaveAttribute('to', '/bookings/booking-referral-1');
});
