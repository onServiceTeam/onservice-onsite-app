import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockApiGet = jest.fn((_url: string, config?: { params?: { page?: number } }) => {
  const page = config?.params?.page ?? 1;
  const item = page === 1
    ? { id: 'series-911-a', subcategoryName: 'Home Cleaning', categoryName: 'Cleaning' }
    : { id: 'series-911-b', subcategoryName: 'Aircon Cleaning', categoryName: 'Aircon' };
  return Promise.resolve({ data: {
    success: true,
    data: [{
      ...item, frequency: 'weekly', preferredDay: 2, preferredTime: '09:00', status: 'active',
      servicePrice: 50000, serviceFee: 5000, totalAmount: 55000, nextScheduledDate: '2026-09-08',
      city: 'Cebu City', totalCompleted: 0,
    }],
    pagination: { page, pageSize: 1, total: 2, totalPages: 2 },
  } });
});

jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn(), push: jest.fn() }) }));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1280, breakpoint: 'desktop', isPhone: false, isTablet: false, isDesktop: true }),
  byBreakpoint: (_breakpoint: string, values: { desktop: number }) => values.desktop,
}));
jest.mock('@/services/api', () => ({ __esModule: true, default: { get: (...args: Parameters<typeof mockApiGet>) => mockApiGet(...args) } }));

import RecurringListScreen from '../app/customer/recurring/index';

it('Bug UX-911 — customer recurring list loads series beyond the first server page', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><RecurringListScreen /></QueryClientProvider>);

  expect(await screen.findByText('Home Cleaning')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Load more recurring bookings' }));

  expect(await screen.findByText('Aircon Cleaning')).toBeTruthy();
  expect(mockApiGet).toHaveBeenCalledWith('/api/v1/recurring', { params: { page: 2, pageSize: 20 } });
});
