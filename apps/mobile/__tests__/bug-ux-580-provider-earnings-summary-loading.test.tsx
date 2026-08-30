import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import api from '@/services/api';
import { getWalletBalance } from '@/services/payment.service';
import { getEarningsSummary } from '@/services/provider-tools.service';

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1100, breakpoint: 'desktop', isPhone: false, isTablet: false, isDesktop: true }),
}));
jest.mock('@/services/api', () => ({ __esModule: true, default: { get: jest.fn() } }));
jest.mock('@/services/payment.service', () => ({ getWalletBalance: jest.fn() }));
jest.mock('@/services/provider-tools.service', () => ({ getEarningsSummary: jest.fn() }));

import EarningsScreen from '../app/(provider-tabs)/earnings';

it('Bug UX-580 — pending provider earnings never appear as confirmed zero while their summary is loading', async () => {
  jest.mocked(getWalletBalance).mockResolvedValue({
    id: 'wallet-1', userId: 'provider-1', type: 'provider',
    availableBalance: 125_000, pendingBalance: 0, currency: 'PHP',
    createdAt: '2026-08-31T00:00:00.000Z',
  });
  jest.mocked(getEarningsSummary).mockReturnValue(new Promise(() => undefined));
  jest.mocked(api.get).mockImplementation(async (url: string) => {
    if (url.includes('/earnings/trends')) return { data: { data: [] } } as never;
    return { data: { data: [], pagination: { total: 0 } } } as never;
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });

  render(<QueryClientProvider client={client}><EarningsScreen /></QueryClientProvider>);

  await waitFor(() => expect(screen.getByText('AVAILABLE BALANCE')).toBeTruthy());
  expect(screen.getAllByText('Loading…')).toHaveLength(2);
  expect(screen.queryByText('₱0.00')).toBeNull();
});
