import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import api from '@/services/api';
import { getWalletBalance } from '@/services/payment.service';

jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn() }) }));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({
    width: 390,
    breakpoint: 'phone',
    isPhone: true,
    isTablet: false,
    isDesktop: false,
  }),
}));
jest.mock('@/services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn() },
}));
jest.mock('@/services/payment.service', () => ({ getWalletBalance: jest.fn() }));

import WithdrawScreen from '../app/provider/withdraw';

it('Bug UX-367 — phone withdrawal form exposes named amount and payout-method controls without changing manual review behavior', async () => {
  jest.mocked(getWalletBalance).mockResolvedValue({
    id: 'wallet-1',
    userId: 'provider-1',
    type: 'provider',
    availableBalance: 100000,
    pendingBalance: 0,
    currency: 'PHP',
    createdAt: '2026-08-24T00:00:00.000Z',
  });
  jest.mocked(api.get).mockImplementation(async (url: string) => {
    if (url === '/api/v1/wallet/payout-preferences') {
      return { data: { data: { preferredMethod: 'manual', destinationAccount: null } } } as never;
    }
    return { data: { data: [] } } as never;
  });

  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><WithdrawScreen /></QueryClientProvider>);

  expect(await screen.findByLabelText('Withdrawal amount')).toBeTruthy();
  const gcash = screen.getByRole('radio', { name: 'GCash payout method' });
  fireEvent.click(gcash);
  expect(screen.getByLabelText('Payout phone number')).toBeTruthy();
  expect(screen.getByText(/Requests are reviewed manually/i)).toBeTruthy();
});
