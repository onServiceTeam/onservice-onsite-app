import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockGet = jest.fn();

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('@/services/api', () => ({
  __esModule: true,
  default: { get: (...args: unknown[]) => mockGet(...args) },
}));

import WalletScreen from '../app/(tabs)/wallet';

it('Bug UX-653 — customer wallet chips request a server-paginated transaction group instead of filtering one loaded page', async () => {
  mockGet.mockImplementation((path: string) => Promise.resolve(path === '/api/v1/wallet'
    ? { data: { data: { availableBalance: 0, pendingBalance: 0 } } }
    : { data: { data: [], pagination: { total: 0 } } }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><WalletScreen /></QueryClientProvider>);

  await screen.findByText('No transactions yet');
  fireEvent.click(screen.getByText('Refunds'));

  await waitFor(() => expect(mockGet).toHaveBeenCalledWith('/api/v1/wallet/transactions', {
    params: { page: 1, pageSize: 20, group: 'refund' },
  }));
  expect(await screen.findByText('No refunds in this view')).toBeTruthy();
});
