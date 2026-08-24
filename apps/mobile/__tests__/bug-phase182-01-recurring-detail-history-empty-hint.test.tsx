import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockGet = jest.fn((url: string) => {
  if (url.endsWith('/instances')) return Promise.resolve({ data: { data: [] } });
  return Promise.resolve({ data: { data: {
    id: 'recurring-1', categoryName: 'Cleaning', subcategoryName: 'Home Cleaning', providerName: null,
    frequency: 'weekly', preferredDay: 2, preferredTime: '09:00', status: 'active',
    servicePrice: 50000, serviceFee: 5000, totalAmount: 55000,
    nextScheduledDate: '2026-09-01', address: '1 Test Street', barangay: 'Lahug', city: 'Cebu City', province: 'Cebu',
    totalCompleted: 0, totalSkipped: 0, cancelReason: null, createdAt: '2026-08-01T00:00:00Z',
  } } });
});

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'recurring-1' }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 390, breakpoint: 'phone', isPhone: true, isTablet: false, isDesktop: false }),
}));
jest.mock('@/services/api', () => ({
  __esModule: true,
  default: { get: (...args: [string]) => mockGet(...args), post: jest.fn() },
}));
jest.mock('@/lib/toast', () => ({ showToast: jest.fn() }));

import RecurringDetailScreen from '../app/customer/recurring/[id]';

it('BUG-PHASE182-01 — empty recurring history explains when scheduled bookings appear', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><RecurringDetailScreen /></QueryClientProvider>);

  fireEvent.click(await screen.findByText('View History'));

  expect(await screen.findByText('No instances yet.')).toBeTruthy();
  expect(screen.getByText('Scheduled bookings will appear here after the recurring series begins.')).toBeTruthy();
});
