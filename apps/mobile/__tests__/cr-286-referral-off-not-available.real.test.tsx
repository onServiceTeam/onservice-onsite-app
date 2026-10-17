// Customer review 2026-10-18, referral off switch (D41 Q32 option a): while
// the server's referral switch is off, the referral screen shows no code box
// and no ₱ amount, only a short "Not available right now" line with one
// button back, and it asks the referral service for nothing. P2 fix round:
// the header no longer names the program while it is off.
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import api from '@/services/api';

const mockBack = jest.fn();
const mockGetMyCode = jest.fn();
const mockGetMyReferrals = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockBack, replace: jest.fn(), push: jest.fn(), canGoBack: () => true }),
}));
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn() }));
jest.mock('@/hooks/useResponsive', () => ({ useResponsive: () => ({ isPhone: true }) }));
jest.mock('@/services/referral.service', () => ({
  getMyCode: (...a: unknown[]) => mockGetMyCode(...a),
  getMyReferrals: (...a: unknown[]) => mockGetMyReferrals(...a),
  redeemCode: jest.fn(),
}));

import ReferralScreen from '../app/customer/referral';

it('Bug CR-286 — with the referral switch off, the referral screen shows "Not available right now" and no code box or ₱ amount', async () => {
  (api.get as jest.Mock).mockReset().mockResolvedValue({
    data: { success: true, data: { referralProgramEnabled: false, requestFirstBooking: true } },
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const { container } = render(<QueryClientProvider client={client}><ReferralScreen /></QueryClientProvider>);

  expect(await screen.findByText('Not available right now')).toBeTruthy();
  expect(api.get).toHaveBeenCalledWith('/api/v1/config');
  expect(container.textContent).not.toMatch(/₱/);
  expect(screen.queryByLabelText('Referral code')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Redeem referral code' })).toBeNull();
  expect(screen.queryByText(/Your Referral Code/i)).toBeNull();
  expect(screen.queryByText('Referral Program')).toBeNull();
  expect(container.textContent).not.toMatch(/Referral/i);
  expect(mockGetMyCode).not.toHaveBeenCalled();
  expect(mockGetMyReferrals).not.toHaveBeenCalled();

  fireEvent.click(screen.getByText('Go back'));
  await waitFor(() => expect(mockBack).toHaveBeenCalledTimes(1));
});
