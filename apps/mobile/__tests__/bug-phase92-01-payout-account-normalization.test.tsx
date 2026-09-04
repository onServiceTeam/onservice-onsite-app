import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import api from '@/services/api';
import { getWalletBalance } from '@/services/payment.service';

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), back: jest.fn() }) }));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({
    width: 1280,
    breakpoint: 'desktop',
    isPhone: false,
    isTablet: false,
    isDesktop: true,
  }),
}));
jest.mock('@/services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn() },
}));
jest.mock('@/services/payment.service', () => ({ getWalletBalance: jest.fn() }));

import WithdrawScreen from '../app/provider/withdraw';
import PayoutSettingsScreen from '../app/provider/payout-settings';

const client = (): QueryClient => new QueryClient({
  defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(getWalletBalance).mockResolvedValue({
    id: 'wallet-phase92',
    userId: 'provider-phase92',
    type: 'provider',
    availableBalance: 100000,
    pendingBalance: 0,
    currency: 'PHP',
    createdAt: '2026-09-01T00:00:00.000Z',
  });
  jest.mocked(api.post).mockResolvedValue({ data: { success: true } } as never);
  jest.mocked(api.put).mockResolvedValue({ data: { success: true } } as never);
});

it('BUG-PHASE92-01 - withdrawal submits a spaced bank account as digits only', async () => {
  jest.mocked(api.get).mockImplementation(async (url: string) => {
    if (url === '/api/v1/wallet/payout-preferences') {
      return { data: { data: { preferredMethod: 'manual', destinationAccount: null } } } as never;
    }
    return { data: { data: [] } } as never;
  });

  render(<QueryClientProvider client={client()}><WithdrawScreen /></QueryClientProvider>);
  fireEvent.change(await screen.findByLabelText('Withdrawal amount'), { target: { value: '250.00' } });
  fireEvent.click(screen.getByRole('radio', { name: 'InstaPay payout method' }));
  fireEvent.change(screen.getByLabelText('Bank account number'), { target: { value: '1234 5678 9012' } });
  fireEvent.click(screen.getByText('Request Withdrawal'));

  const buttons = (Alert.alert as jest.Mock).mock.calls[0]![2] as Array<{
    text: string;
    onPress?: () => void;
  }>;
  await act(async () => buttons.find((button) => button.text === 'Confirm')?.onPress?.());

  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/api/v1/wallet/withdraw', expect.objectContaining({
    destinationAccount: '123456789012',
  })));
});

it('BUG-PHASE92-01 - payout settings saves a spaced bank account as digits only', async () => {
  jest.mocked(api.get).mockResolvedValue({
    data: {
      data: {
        frequency: 'manual',
        minThreshold: 10000,
        preferredMethod: 'gcash',
        destinationAccount: '09171234567',
      },
    },
  } as never);

  render(<QueryClientProvider client={client()}><PayoutSettingsScreen /></QueryClientProvider>);
  expect(await screen.findByText('Manual withdrawals only')).toBeTruthy();
  fireEvent.click(screen.getByRole('radio', { name: 'Bank Transfer (InstaPay) payout method' }));
  fireEvent.change(screen.getByLabelText('Withdrawal account number'), { target: { value: '1234 5678 9012' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save withdrawal details' }));

  await waitFor(() => expect(api.put).toHaveBeenCalledWith('/api/v1/wallet/payout-preferences', {
    preferredMethod: 'bank_instapay',
    destinationAccount: '123456789012',
  }));
});
