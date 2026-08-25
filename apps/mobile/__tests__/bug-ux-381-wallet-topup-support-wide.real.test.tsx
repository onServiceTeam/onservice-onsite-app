import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn(), push: mockPush }) }));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 820, breakpoint: 'tablet', isPhone: false, isTablet: true, isDesktop: false }),
}));
jest.mock('@/services/payment.service', () => ({
  getWalletBalance: jest.fn().mockResolvedValue({ availableBalance: 125000, pendingBalance: 0 }),
}));

import WalletTopUpScreen from '../app/customer/wallet-topup';

it('Bug UX-381 — tablet top-up hold explains the containment and provides a prefilled payment-support path', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><WalletTopUpScreen /></QueryClientProvider>);

  expect(screen.getByLabelText('Wide wallet top-up availability workspace')).toBeTruthy();
  expect(await screen.findByText('₱1,250.00')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Contact support about a pending wallet top-up' }));
  expect(mockPush).toHaveBeenCalledWith({
    pathname: '/support/new',
    params: {
      type: 'payment_issue',
      subject: 'Wallet top-up still pending',
      description: 'I need help checking a previous wallet top-up that still appears pending.',
    },
  });
});
