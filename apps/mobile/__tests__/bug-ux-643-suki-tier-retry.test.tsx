import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockGetTiers = jest.fn();

jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn(), push: jest.fn() }) }));
jest.mock('@/services/suki.service', () => ({
  getMemberships: jest.fn().mockResolvedValue([]),
  getTiers: (...args: unknown[]) => mockGetTiers(...args),
  redeemPoints: jest.fn(),
}));

import SukiProsScreen from '../app/customer/suki-pros';

it('Bug UX-643 — failed loyalty-tier rules expose a working retry instead of instructing an unavailable pull refresh', async () => {
  mockGetTiers.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce([]);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><SukiProsScreen /></QueryClientProvider>);

  const retry = await screen.findByRole('button', { name: 'Retry loyalty tiers' });
  fireEvent.click(retry);

  await waitFor(() => expect(mockGetTiers).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Retry loyalty tiers' })).toBeNull());
});
