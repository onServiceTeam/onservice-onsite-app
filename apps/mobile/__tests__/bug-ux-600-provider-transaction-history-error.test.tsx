import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import api from '@/services/api';
import { getWalletBalance } from '@/services/payment.service';

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1100, breakpoint: 'desktop', isPhone: false, isTablet: false, isDesktop: true }),
}));
jest.mock('@/services/api', () => ({ __esModule: true, default: { get: jest.fn() } }));
jest.mock('@/services/payment.service', () => ({ getWalletBalance: jest.fn() }));
jest.mock('@/services/provider-tools.service', () => ({
  getEarningsSummary: jest.fn().mockResolvedValue({
    earnedToday: 0, earnedThisWeek: 0, earnedThisMonth: 100_000, pendingEscrow: 20_000,
    jobsToday: 0, jobsThisWeek: 0, jobsThisMonth: 1,
  }),
}));

import EarningsScreen from '../app/(provider-tabs)/earnings';

it('Bug UX-600 — failed transaction history does not hide a valid provider balance and earnings summary', async () => {
  jest.mocked(getWalletBalance).mockResolvedValue({
    id: 'wallet-1', userId: 'provider-1', type: 'provider', availableBalance: 125_000,
    pendingBalance: 0, currency: 'PHP', createdAt: '2026-08-31T00:00:00.000Z',
  });
  jest.mocked(api.get).mockImplementation(async (url: string) => {
    if (url.includes('/earnings/trends')) return { data: { data: [] } } as never;
    throw new Error('transactions unavailable');
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><EarningsScreen /></QueryClientProvider>);

  expect(await screen.findByText('Transaction history unavailable')).toBeTruthy();
  expect(screen.getByText('AVAILABLE BALANCE')).toBeTruthy();
  expect(screen.getByText('₱1,250.00')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Retry loading' }));
  await waitFor(() => {
    const calls = jest.mocked(api.get).mock.calls.filter(([url]) => url === '/api/v1/wallet/transactions');
    expect(calls).toHaveLength(2);
  });
});
