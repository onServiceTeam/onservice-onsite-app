import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn(), push: jest.fn() }) }));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1280, breakpoint: 'desktop', isPhone: false, isTablet: false, isDesktop: true }),
  byBreakpoint: (_breakpoint: string, values: { desktop: number }) => values.desktop,
}));
jest.mock('@/services/api', () => ({
  __esModule: true,
  default: {
    get: jest.fn().mockResolvedValue({
      data: {
        success: true,
        data: [{
          id: 'recurring-1', categoryName: 'Cleaning', subcategoryName: 'Home Cleaning',
          frequency: 'weekly', preferredDay: 2, preferredTime: '09:00', status: 'active',
          servicePrice: 50000, serviceFee: 5000, totalAmount: 55000,
          nextScheduledDate: '2026-09-01', city: 'Cebu City', totalCompleted: 2,
        }],
        pagination: { total: 1 },
      },
    }),
  },
}));

import RecurringListScreen from '../app/customer/recurring/index';

it('BUG-UX-163 — recurring list shows the visit total and a bounded desktop grid', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><RecurringListScreen /></QueryClientProvider>);

  expect(await screen.findByLabelText('Tablet and desktop recurring booking grid')).toBeTruthy();
  expect(screen.getByText('₱550.00 per visit, including fee')).toBeTruthy();
  expect(screen.getByLabelText('Open Home Cleaning recurring booking')).toBeTruthy();
});
