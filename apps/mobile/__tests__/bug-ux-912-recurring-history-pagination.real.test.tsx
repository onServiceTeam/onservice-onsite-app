import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockApiGet = jest.fn((url: string, config?: { params?: { page?: number } }) => {
  if (url.endsWith('/instances')) {
    const page = config?.params?.page ?? 1;
    return Promise.resolve({ data: {
      success: true,
      data: [{ id: `instance-${page}`, scheduledDate: page === 1 ? '2026-09-01' : '2026-08-25', status: 'completed', bookingId: `booking-${page}`, failureReason: null }],
      pagination: { page, pageSize: 1, total: 2, totalPages: 2 },
    } });
  }
  return Promise.resolve({ data: { data: {
    id: 'recurring-912', categoryName: 'Cleaning', subcategoryName: 'Home Cleaning', providerName: null,
    frequency: 'weekly', preferredDay: 2, preferredTime: '09:00', status: 'active',
    servicePrice: 50000, serviceFee: 5000, totalAmount: 55000, nextScheduledDate: '2026-09-08',
    address: '1 Test Street', barangay: 'Lahug', city: 'Cebu City', province: 'Cebu',
    totalCompleted: 2, totalSkipped: 0, cancelReason: null, createdAt: '2026-08-01T00:00:00Z',
  } } });
});

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'recurring-912' }),
}));
jest.mock('@/hooks/useResponsive', () => ({ useResponsive: () => ({ width: 390, breakpoint: 'phone', isPhone: true, isTablet: false, isDesktop: false }) }));
jest.mock('@/services/api', () => ({ __esModule: true, default: { get: (...args: Parameters<typeof mockApiGet>) => mockApiGet(...args), post: jest.fn() } }));
jest.mock('@/lib/toast', () => ({ showToast: jest.fn() }));

import RecurringDetailScreen from '../app/customer/recurring/[id]';

it('Bug UX-912 — customer recurring detail loads generated-booking history beyond the first server page', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><RecurringDetailScreen /></QueryClientProvider>);

  fireEvent.click(await screen.findByText('View History'));
  expect(await screen.findByRole('button', { name: 'Open booking from 2026-09-01' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Load more recurring booking history' }));

  expect(await screen.findByRole('button', { name: 'Open booking from 2026-08-25' })).toBeTruthy();
  expect(mockApiGet).toHaveBeenCalledWith('/api/v1/recurring/recurring-912/instances', { params: { page: 2, pageSize: 20 } });
});
