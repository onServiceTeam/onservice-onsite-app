import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn(), push: jest.fn() }) }));
jest.mock('@/services/payment.service', () => ({
  getWalletBalance: jest.fn().mockRejectedValue(new Error('wallet unavailable')),
}));

import WalletTopUpScreen from '../app/customer/wallet-topup';

it('Bug UX-632 — the held wallet top-up screen exposes a retry when the current balance cannot be verified', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><WalletTopUpScreen /></QueryClientProvider>);

  expect(await screen.findByText('Unavailable')).toBeTruthy();
  expect(screen.getByText('We could not verify your current balance.')).toBeTruthy();
  expect(screen.getByLabelText('Retry loading wallet balance')).toBeTruthy();
});
