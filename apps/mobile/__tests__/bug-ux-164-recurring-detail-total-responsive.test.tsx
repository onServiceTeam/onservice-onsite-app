import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'recurring-1' }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1180, breakpoint: 'desktop', isPhone: false, isTablet: false, isDesktop: true }),
}));
jest.mock('@/services/api', () => ({
  __esModule: true,
  default: {
    get: jest.fn().mockResolvedValue({
      data: { data: {
        id: 'recurring-1', categoryName: 'Cleaning', subcategoryName: 'Home Cleaning', providerName: 'Provider One',
        frequency: 'weekly', preferredDay: 2, preferredTime: '09:00', status: 'active',
        servicePrice: 50000, serviceFee: 5000, totalAmount: 55000,
        nextScheduledDate: '2026-09-01', address: '1 Test Street', barangay: 'Lahug', city: 'Cebu City', province: 'Cebu',
        totalCompleted: 2, totalSkipped: 1, cancelReason: null, createdAt: '2026-08-01T00:00:00Z',
      } },
    }),
    post: jest.fn(),
  },
}));
jest.mock('@/lib/toast', () => ({ showToast: jest.fn() }));

import RecurringDetailScreen from '../app/customer/recurring/[id]';

it('BUG-UX-164 — recurring detail shows the full visit total in a desktop management workspace', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><RecurringDetailScreen /></QueryClientProvider>);

  expect(await screen.findByLabelText('Tablet and desktop recurring booking management workspace')).toBeTruthy();
  expect(screen.getByText('Service price')).toBeTruthy();
  expect(screen.getByText('Service fee')).toBeTruthy();
  expect(screen.getByText('Scheduled total')).toBeTruthy();
  expect(screen.getAllByText('₱550.00')).toHaveLength(2);
});
