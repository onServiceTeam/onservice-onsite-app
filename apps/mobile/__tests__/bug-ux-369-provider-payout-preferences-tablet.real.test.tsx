import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import api from '@/services/api';

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), back: jest.fn() }) }));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 820, breakpoint: 'tablet', isPhone: false, isTablet: true, isDesktop: false }),
}));
jest.mock('@/services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), put: jest.fn() },
}));

import PayoutSettingsScreen from '../app/provider/payout-settings';

it('Bug UX-369 — withdrawal preferences use the wide split workspace on tablet', async () => {
  jest.mocked(api.get).mockResolvedValueOnce({
    data: {
      success: true,
      data: {
        frequency: 'manual',
        minThreshold: 50_000,
        preferredMethod: 'gcash',
        destinationAccount: '09171234567',
      },
    },
  } as never);

  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(
    <QueryClientProvider client={client}>
      <PayoutSettingsScreen />
    </QueryClientProvider>,
  );

  expect(await screen.findByLabelText('Tablet and desktop withdrawal preferences workspace')).toBeTruthy();
  expect(screen.getByLabelText('GCash payout method')).toBeTruthy();
  expect(screen.getByLabelText('Maya payout method')).toBeTruthy();
  expect(screen.getByLabelText('Bank Transfer (InstaPay) payout method')).toBeTruthy();
  expect(screen.getByLabelText('Bank Transfer (PESONet) payout method')).toBeTruthy();
});
