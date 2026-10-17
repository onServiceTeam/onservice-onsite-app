// Customer review 2026-10-18, referral off switch (D41 Q32): the app fails
// closed. A server that does not send the referral switch (an older server)
// counts as off, so the screen never offers wallet money the server would
// refuse.
import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import api from '@/services/api';

const mockGetMyCode = jest.fn().mockResolvedValue({ code: 'CEBU25', referrerBonus: 5000, refereeBonus: 5000 });
const mockGetMyReferrals = jest.fn().mockResolvedValue({ summary: { totalReferrals: 0, totalEarned: 0 }, redemptions: [] });
jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn(), replace: jest.fn() }) }));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn() }));
jest.mock('@/hooks/useResponsive', () => ({ useResponsive: () => ({ isPhone: true }) }));
jest.mock('@/services/referral.service', () => ({
  getMyCode: (...a: unknown[]) => mockGetMyCode(...a),
  getMyReferrals: (...a: unknown[]) => mockGetMyReferrals(...a),
  redeemCode: jest.fn(),
}));

import ReferralScreen from '../app/customer/referral';

it('Bug CR-287 — a config without the referral switch counts as off, so no code or ₱ amount is shown', async () => {
  // An older server's config bundle: other settings, no referral switch.
  (api.get as jest.Mock).mockReset().mockResolvedValue({ data: { success: true, data: { requestFirstBooking: true } } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const { container } = render(<QueryClientProvider client={client}><ReferralScreen /></QueryClientProvider>);

  expect(await screen.findByText('Not available right now')).toBeTruthy();
  expect(container.textContent).not.toMatch(/₱|CEBU25/);
  expect(mockGetMyCode).not.toHaveBeenCalled();
  expect(mockGetMyReferrals).not.toHaveBeenCalled();
});
