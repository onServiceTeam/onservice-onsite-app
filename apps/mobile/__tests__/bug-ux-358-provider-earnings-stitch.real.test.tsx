import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Routes } from '@/config/navigation';

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1100, breakpoint: 'desktop', isPhone: false, isTablet: false, isDesktop: true }),
}));
jest.mock('@/services/payment.service', () => ({
  getWalletBalance: jest.fn().mockResolvedValue({
    id: 'wallet-1',
    userId: 'provider-1',
    type: 'provider',
    availableBalance: 1_245_000,
    pendingBalance: 320_000,
    currency: 'PHP',
    createdAt: '2026-08-01T00:00:00.000Z',
  }),
}));
jest.mock('@/services/provider-tools.service', () => ({
  getEarningsSummary: jest.fn().mockResolvedValue({
    earnedToday: 85_000,
    earnedThisWeek: 450_000,
    earnedThisMonth: 1_458_000,
    pendingEscrow: 320_000,
    jobsToday: 1,
    jobsThisWeek: 5,
    jobsThisMonth: 18,
  }),
}));
jest.mock('@/services/api', () => ({
  __esModule: true,
  default: {
    get: jest.fn((url: string) => {
      if (url.includes('/earnings/trends')) {
        return Promise.resolve({ data: { data: [{ period: '2026-08-25', totalEarned: 100_000, totalCommission: 15_000, netEarned: 85_000, jobCount: 1 }] } });
      }
      return Promise.resolve({
        data: {
          data: [{
            id: 'tx-1',
            walletId: 'wallet-1',
            bookingId: 'booking-1',
            type: 'escrow_release',
            amount: 85_000,
            balanceAfter: 1_245_000,
            description: 'AC Cleaning Service',
            referenceId: 'booking-1',
            createdAt: '2026-08-25T08:00:00.000Z',
          }],
          pagination: { total: 1 },
        },
      });
    }),
  },
}));

import EarningsScreen from '../app/(provider-tabs)/earnings';

it('Bug UX-358 — provider earnings separates available, pending, and period money while linking payout accounts and job transactions', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(
    <QueryClientProvider client={client}>
      <EarningsScreen />
    </QueryClientProvider>,
  );

  await waitFor(() => expect(screen.getByText('AVAILABLE BALANCE')).toBeTruthy());
  expect(screen.getByText('Pending job earnings')).toBeTruthy();
  expect(screen.getByText('This month')).toBeTruthy();
  expect(screen.getByText('₱14,580.00')).toBeTruthy();

  fireEvent.click(screen.getByRole('button', { name: 'Manage payout accounts' }));
  expect(mockPush).toHaveBeenCalledWith(Routes.PROVIDER.PAYOUT_SETTINGS);
  fireEvent.click(screen.getByRole('button', { name: 'Open job for AC Cleaning Service' }));
  expect(mockPush).toHaveBeenCalledWith('/provider/job/booking-1');
});
