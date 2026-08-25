import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockCopy = jest.fn().mockResolvedValue(undefined);

jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn() }) }));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1280, breakpoint: 'desktop', isPhone: false, isTablet: false, isDesktop: true }),
}));
jest.mock('expo-clipboard', () => ({ setStringAsync: (...args: unknown[]) => mockCopy(...args) }));
jest.mock('@/services/referral.service', () => ({
  getMyCode: jest.fn().mockResolvedValue({ code: 'CEBU2026', refereeBonus: 10000, referrerBonus: 10000 }),
  getMyReferrals: jest.fn().mockResolvedValue({ summary: { totalReferrals: 0, totalEarned: 0 }, redemptions: [] }),
  redeemCode: jest.fn(),
}));

import ReferralScreen from '../app/customer/referral';

it('Bug UX-388 — referral copy, share, redeem, and navigation actions expose clear names and a real copy interaction', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><ReferralScreen /></QueryClientProvider>);

  fireEvent.click(await screen.findByRole('button', { name: 'Copy referral code' }));
  await waitFor(() => expect(mockCopy).toHaveBeenCalledWith('CEBU2026'));
  expect(screen.getByRole('button', { name: 'Share referral code' })).toBeTruthy();
  expect(screen.getByLabelText('Referral code')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Redeem referral code' }).hasAttribute('disabled')).toBe(true);
  expect(screen.getByRole('button', { name: 'Go back from referrals' })).toBeTruthy();
});
