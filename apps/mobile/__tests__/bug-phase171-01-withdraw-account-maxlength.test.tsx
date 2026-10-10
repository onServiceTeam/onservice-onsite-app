import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import api from '@/services/api';
import { getWalletBalance } from '@/services/payment.service';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
}));
jest.mock('@/services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn() },
}));
jest.mock('@/services/payment.service', () => ({
  getWalletBalance: jest.fn(),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1024, breakpoint: 'tablet', isPhone: false, isTablet: true, isDesktop: false }),
}));

import WithdrawScreen from '../app/provider/withdraw';

it('Bug PHASE171-01 - provider withdrawal destination input enforces the server 255-character limit', async () => {
  jest.mocked(getWalletBalance).mockResolvedValue({
    id: 'wallet-phase171', userId: 'provider-phase171', type: 'provider',
    availableBalance: 100_000, pendingBalance: 0, currency: 'PHP',
    createdAt: '2026-09-01T00:00:00.000Z',
  });
  jest.mocked(api.get).mockImplementation(async (url: string) => {
    if (url === '/api/v1/wallet/payout-preferences') {
      return { data: { data: { preferredMethod: 'manual', destinationAccount: null } } } as never;
    }
    return { data: { data: [] } } as never;
  });

  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <WithdrawScreen />
    </QueryClientProvider>,
  );

  expect(await screen.findByLabelText('Desktop withdrawal request workspace')).toBeTruthy();
  fireEvent.click(screen.getByRole('radio', { name: 'GCash payout method' }));
  await waitFor(() => expect(screen.getByLabelText('Payout phone number')).toBeTruthy());
  expect(screen.getByLabelText('Payout phone number').getAttribute('maxlength')).toBe('255');
});
