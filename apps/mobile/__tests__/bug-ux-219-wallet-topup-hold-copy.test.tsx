import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('@/services/payment.service', () => ({
  getWalletBalance: jest.fn().mockResolvedValue({ availableBalance: 0, pendingBalance: 0 }),
}));
jest.mock('@/services/api', () => ({
  __esModule: true,
  default: { get: jest.fn().mockResolvedValue({ data: { data: [], pagination: { total: 0 } } }) },
}));

import WalletScreen from '../app/(tabs)/wallet';

it('Bug UX-219 — the wallet entry point labels top-up as paused and does not recommend an unavailable funding path', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><WalletScreen /></QueryClientProvider>);

  expect(await screen.findByText('Top Up Paused')).toBeTruthy();
  expect(screen.getByText(/New top-ups are temporarily unavailable/i)).toBeTruthy();
  expect(screen.queryByText('+ Top Up')).toBeNull();
});
