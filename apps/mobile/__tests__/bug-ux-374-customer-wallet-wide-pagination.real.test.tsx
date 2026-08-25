import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import api from '@/services/api';

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({
    width: 820,
    breakpoint: 'tablet',
    isPhone: false,
    isTablet: true,
    isDesktop: false,
  }),
}));
jest.mock('@/services/payment.service', () => ({
  getWalletBalance: jest.fn().mockResolvedValue({ availableBalance: 125000, pendingBalance: 20000 }),
}));
jest.mock('@/services/api', () => ({
  __esModule: true,
  default: { get: jest.fn() },
}));

import WalletScreen from '../app/(tabs)/wallet';

function transaction(id: number): Record<string, unknown> {
  return {
    id: `transaction-${id}`,
    walletId: 'wallet-1',
    bookingId: `booking-${id}`,
    type: 'payment',
    amount: -10000,
    balanceAfter: 125000 - id,
    description: `Booking payment ${id}`,
    referenceId: null,
    createdAt: '2026-08-24T01:00:00.000Z',
  };
}

it('Bug UX-374 — tablet wallet uses a bounded split workspace and can load transaction history beyond the first page', async () => {
  jest.mocked(api.get)
    .mockResolvedValueOnce({
      data: { data: Array.from({ length: 20 }, (_, index) => transaction(index + 1)), pagination: { total: 21 } },
    } as never)
    .mockResolvedValueOnce({
      data: { data: [transaction(21)], pagination: { total: 21 } },
    } as never);

  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><WalletScreen /></QueryClientProvider>);

  expect(await screen.findByLabelText('Wide customer wallet workspace')).toBeTruthy();
  expect(screen.getByLabelText('Customer wallet balance summary')).toBeTruthy();
  expect(await screen.findByRole('button', { name: 'Open wallet top-up availability information' })).toBeTruthy();

  fireEvent.click(await screen.findByRole('button', { name: 'Load more wallet transactions' }));
  await waitFor(() => expect(screen.getByText('Booking payment 21')).toBeTruthy());
  expect(api.get).toHaveBeenLastCalledWith('/api/v1/wallet/transactions', { params: { page: 2, pageSize: 20 } });
});
