import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import api from '@/services/api';
import { getWalletBalance } from '@/services/payment.service';

jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn() }) }));
jest.mock('@/services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn() },
}));
jest.mock('@/services/payment.service', () => ({ getWalletBalance: jest.fn() }));

import WithdrawScreen from '../app/provider/withdraw';

it('Bug OPS-300 - provider withdrawal sends the entered payout account holder name to finance', async () => {
  jest.mocked(getWalletBalance).mockResolvedValue({
    id: 'wallet-ops-300',
    userId: 'provider-ops-300',
    type: 'provider',
    availableBalance: 100000,
    pendingBalance: 0,
    currency: 'PHP',
    createdAt: '2026-09-01T00:00:00.000Z',
  });
  jest.mocked(api.get).mockImplementation(async (url: string) => {
    if (url === '/api/v1/wallet/payout-preferences') {
      return { data: { data: { preferredMethod: 'manual', destinationAccount: null } } } as never;
    }
    return { data: { data: [] } } as never;
  });
  jest.mocked(api.post).mockResolvedValue({ data: { success: true } } as never);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  render(
    <QueryClientProvider client={client}>
      <WithdrawScreen />
    </QueryClientProvider>,
  );

  fireEvent.change(await screen.findByLabelText('Withdrawal amount'), {
    target: { value: '250.00' },
  });
  fireEvent.click(screen.getByRole('radio', { name: 'InstaPay payout method' }));
  fireEvent.change(screen.getByLabelText('Bank account number'), {
    target: { value: '1234 5678 9012' },
  });
  fireEvent.change(screen.getByLabelText('Account holder name (optional)'), {
    target: { value: '  Roberto Santos  ' },
  });
  fireEvent.click(screen.getByText('Request Withdrawal'));

  const buttons = (Alert.alert as jest.Mock).mock.calls[0]![2] as Array<{
    text: string;
    onPress?: () => void;
  }>;
  await act(async () => buttons.find((button) => button.text === 'Confirm')?.onPress?.());

  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/api/v1/wallet/withdraw', {
    amount: 25000,
    method: 'bank_instapay',
    destinationAccount: '123456789012',
    accountName: 'Roberto Santos',
  }));
});
