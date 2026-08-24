import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import api from '@/services/api';
import { getWalletBalance } from '@/services/payment.service';

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 920, breakpoint: 'tablet', isPhone: false, isTablet: true, isDesktop: false }),
}));
jest.mock('@/services/api', () => ({ __esModule: true, default: { get: jest.fn() } }));
jest.mock('@/services/payment.service', () => ({ getWalletBalance: jest.fn() }));

import EarningsScreen from '../app/(provider-tabs)/earnings';

it('Bug UX-123 — earnings uses recorded period totals instead of reverse-engineering gross from wallet balance', async () => {
  jest.mocked(getWalletBalance).mockResolvedValue({
    id: 'wallet-1', userId: 'provider-1', type: 'provider',
    availableBalance: 50_000, pendingBalance: 10_000, currency: 'PHP',
    createdAt: '2026-08-24T00:00:00.000Z',
  });
  jest.mocked(api.get).mockImplementation(async (url: string) => {
    if (url.includes('/earnings/trends')) {
      return { data: { data: [{ period: '2026-08-24', totalEarned: 100_000, totalCommission: 15_000, netEarned: 85_000, jobCount: 1 }] } } as never;
    }
    return {
      data: {
        data: [{
          id: 'tx-1', walletId: 'wallet-1', bookingId: 'booking-1', type: 'escrow_release',
          amount: 85_000, balanceAfter: 50_000, description: 'Completed plumbing job',
          referenceId: 'booking-1', createdAt: '2026-08-24T00:00:00.000Z',
        }],
        pagination: { total: 1 },
      },
    } as never;
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><EarningsScreen /></QueryClientProvider>);

  expect(await screen.findByText('Paid jobs, last 7 days')).toBeTruthy();
  expect(screen.getByText('Gross')).toBeTruthy();
  expect(screen.getAllByText('₱1,000.00').length).toBeGreaterThan(0);
  expect(screen.getByText(/reserved for a payout in progress/i)).toBeTruthy();
  expect(screen.getByLabelText('Wide provider earnings workspace')).toBeTruthy();
  expect(screen.queryByText('Guarantee fund')).toBeNull();
});
