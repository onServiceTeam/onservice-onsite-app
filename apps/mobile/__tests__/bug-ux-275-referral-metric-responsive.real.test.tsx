import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn() }) }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn() }));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1024, breakpoint: 'desktop', isPhone: false, isTablet: false, isDesktop: true }),
}));
jest.mock('@/services/referral.service', () => ({
  getMyCode: jest.fn().mockResolvedValue({ code: 'CEBU25', referrerBonus: 10000, refereeBonus: 10000 }),
  getMyReferrals: jest.fn().mockResolvedValue({
    code: { code: 'CEBU25', usesCount: 25, referrerBonus: 10000, refereeBonus: 10000 },
    redemptions: [{ id: 'latest', referrerCredited: true, referrerBonus: 10000, createdAt: '2026-08-25T00:00:00.000Z' }],
    summary: { totalReferrals: 25, creditedReferrals: 22, pendingReferrals: 3, totalEarned: 275000 },
  }),
  redeemCode: jest.fn(),
}));

import ReferralScreen from '../app/customer/referral';

it('Bug UX-275 — referral workspace renders server-wide totals rather than summing the truncated history page', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><ReferralScreen /></QueryClientProvider>);

  expect(await screen.findByLabelText('Tablet and desktop customer referral workspace')).toBeTruthy();
  expect(screen.getByText('25')).toBeTruthy();
  expect(screen.getByText(/2,750\.00/)).toBeTruthy();
  expect(screen.getByText(/credited referral bonuses only/i)).toBeTruthy();
  expect(screen.getByText(/latest 1 of 25 referrals/i)).toBeTruthy();
});
