import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import api from '@/services/api';
import { getWalletBalance } from '@/services/payment.service';

jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn() }) }));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1280, breakpoint: 'desktop', isPhone: false, isTablet: false, isDesktop: true }),
}));
jest.mock('@/services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn() },
}));
jest.mock('@/services/payment.service', () => ({ getWalletBalance: jest.fn() }));

import WithdrawScreen from '../app/provider/withdraw';

it('Bug UX-231 — provider withdrawal is a bounded desktop request form that discloses manual and internal risk review', async () => {
  jest.mocked(getWalletBalance).mockResolvedValue({
    id: 'wallet-1', userId: 'provider-1', type: 'provider', availableBalance: 100000,
    pendingBalance: 0, currency: 'PHP', createdAt: '2026-08-24T00:00:00.000Z',
  });
  jest.mocked(api.get).mockImplementation(async (url: string) => {
    if (url === '/api/v1/wallet/payout-preferences') {
      return { data: { data: { preferredMethod: 'gcash', destinationAccount: '09171234567' } } } as never;
    }
    return { data: { data: [] } } as never;
  });

  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><WithdrawScreen /></QueryClientProvider>);

  expect(await screen.findByLabelText('Desktop withdrawal request workspace')).toBeTruthy();
  expect(screen.getByText(/Requests are reviewed manually/i)).toBeTruthy();
  expect(screen.getByText(/Large amounts may enter an internal risk review/i)).toBeTruthy();
  expect(screen.queryByText(/It is being processed/i)).toBeNull();
});
