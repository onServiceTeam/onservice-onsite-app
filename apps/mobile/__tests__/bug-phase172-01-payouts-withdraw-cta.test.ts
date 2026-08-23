import React from 'react';
import { fireEvent, render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import PayoutsScreen from '../app/provider/payouts';
import { Routes } from '@/config/navigation';

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn() }),
}));

jest.mock('@/services/api', () => ({
  __esModule: true,
  default: {
    get: jest.fn((url: string) => {
      if (url === '/api/v1/wallet/payouts') {
        return Promise.resolve({
          data: {
            data: [],
            pagination: { total: 0, page: 1, pageSize: 20, totalPages: 0 },
          },
        });
      }
      if (url.includes('/earnings/trends')) return Promise.resolve({ data: { data: [] } });
      if (url === '/api/v1/providers/me') {
        return Promise.resolve({ data: { data: { tier: 'new' } } });
      }
      return Promise.resolve({ data: { data: [] } });
    }),
  },
}));

describe('provider payout navigation', () => {
  it('BUG-PHASE172-01 — opens withdrawal from the payout header action', () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    const { getByRole } = render(
      React.createElement(
        QueryClientProvider,
        { client },
        React.createElement(PayoutsScreen),
      ),
    );

    fireEvent.click(getByRole('button', { name: 'Request a new withdrawal' }));
    expect(mockPush).toHaveBeenCalledWith(Routes.PROVIDER.WITHDRAW);
  });
});
