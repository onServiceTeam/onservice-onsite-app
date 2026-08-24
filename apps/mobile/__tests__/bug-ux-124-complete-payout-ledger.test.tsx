import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import api from '@/services/api';

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), back: jest.fn() }) }));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1280, breakpoint: 'desktop', isPhone: false, isTablet: false, isDesktop: true }),
}));
jest.mock('@/services/api', () => ({ __esModule: true, default: { get: jest.fn() } }));

import PayoutsScreen from '../app/provider/payouts';

it('Bug UX-124 — payout ledger renders the internal large-payout state and wide workspace from the canonical response', async () => {
  jest.mocked(api.get).mockResolvedValueOnce({
    data: {
      success: true,
      data: [{
        id: 'payout-1', providerId: 'provider-1', amount: 50_000_000,
        method: 'gcash', destinationAccount: '09171234567', status: 'aml_review_pending',
        failureReason: null, rejectionReason: null, createdAt: '2026-08-24T00:00:00.000Z', completedAt: null,
      }],
      pagination: { total: 1, page: 1, pageSize: 20, totalPages: 1 },
    },
  } as never);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><PayoutsScreen /></QueryClientProvider>);

  expect(await screen.findByText('Large payout review')).toBeTruthy();
  expect(screen.getByText(/internal large-payout review hold before standard processing/i)).toBeTruthy();
  expect(screen.getByText(/does not mean a legal report was filed or required/i)).toBeTruthy();
  expect(screen.getByText('Manual withdrawal history')).toBeTruthy();
  expect(screen.getByLabelText('Wide payout ledger workspace')).toBeTruthy();
  expect(screen.queryByText(/Platform commission/)).toBeNull();
});
