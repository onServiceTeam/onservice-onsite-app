import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import api from '@/services/api';
import { getWalletBalance } from '@/services/payment.service';

jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn() }) }));
jest.mock('@/services/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));
jest.mock('@/services/payment.service', () => ({ getWalletBalance: jest.fn() }));

import WithdrawScreen from '../app/provider/withdraw';

it('Bug UX-598 — failed saved payout details are disclosed while manual withdrawal entry remains available', async () => {
  jest.mocked(getWalletBalance).mockResolvedValue({
    id: 'wallet-1', userId: 'provider-1', type: 'provider', availableBalance: 100_000,
    pendingBalance: 0, currency: 'PHP', createdAt: '2026-08-31T00:00:00.000Z',
  });
  jest.mocked(api.get).mockImplementation(async (url: string) => {
    if (url === '/api/v1/wallet/payout-preferences') throw new Error('preferences unavailable');
    return { data: { data: [] } } as never;
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><WithdrawScreen /></QueryClientProvider>);

  expect(await screen.findByText('Saved payout details unavailable')).toBeTruthy();
  expect(screen.getByLabelText('Withdrawal amount')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Retry loading' }));
  await waitFor(() => {
    const calls = jest.mocked(api.get).mock.calls.filter(([url]) => url === '/api/v1/wallet/payout-preferences');
    expect(calls).toHaveLength(2);
  });
});
