import React from 'react';
import { render, screen } from '@testing-library/react';
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

import WithdrawScreen from '../app/provider/withdraw';

it('Bug UX-074 — saved payout details prefill the editable manual withdrawal request', async () => {
  jest.mocked(getWalletBalance).mockResolvedValue({
    id: 'wallet-1',
    userId: 'provider-1',
    type: 'provider',
    availableBalance: 100_000,
    pendingBalance: 0,
    currency: 'PHP',
    createdAt: '2026-08-24T00:00:00.000Z',
  });
  jest.mocked(api.get).mockImplementation(async (url: string) => {
    if (url === '/api/v1/wallet/payout-preferences') {
      return {
        data: {
          data: { preferredMethod: 'gcash', destinationAccount: '09171234567' },
        },
      } as never;
    }
    return { data: { data: [] } } as never;
  });

  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <WithdrawScreen />
    </QueryClientProvider>,
  );

  expect(await screen.findByDisplayValue('09171234567')).toBeTruthy();
  expect(screen.getByText('Phone Number')).toBeTruthy();
  expect(screen.getByText('Request Withdrawal')).toBeTruthy();
});
