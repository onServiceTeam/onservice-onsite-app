import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import api from '@/services/api';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ isDesktop: true, isTablet: false, isPhone: false, width: 1280 }),
}));
jest.mock('@/services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), put: jest.fn() },
}));

import PayoutSettingsScreen from '../app/provider/payout-settings';

it('Bug UX-069 — provider payout settings honestly present manual-only launch behavior', async () => {
  jest.mocked(api.get).mockResolvedValueOnce({
    data: {
      success: true,
      data: {
        frequency: 'biweekly',
        minThreshold: 50_000,
        preferredMethod: 'gcash',
        destinationAccount: '09171234567',
      },
    },
  } as never);

  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <PayoutSettingsScreen />
    </QueryClientProvider>,
  );

  expect(await screen.findByText('Manual withdrawals only')).toBeTruthy();
  expect(screen.getByText(/saved bi-weekly preference is preserved/i)).toBeTruthy();
  expect(screen.queryByText('Automatic payout every day')).toBeNull();
  expect(screen.queryByText('Automatic payout every Monday')).toBeNull();
  expect(screen.getByText('Save withdrawal details')).toBeTruthy();
  expect(screen.getByLabelText('Desktop withdrawal preferences workspace')).toBeTruthy();
});
