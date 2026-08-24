import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockPush = jest.fn();
const mockGet = jest.fn((url: string) => {
  if (url.endsWith('/instances')) {
    return Promise.resolve({ data: { data: [{
      id: 'instance-1', scheduledDate: '2026-08-20', status: 'completed', bookingId: 'booking-1', failureReason: null,
    }] } });
  }
  return Promise.resolve({ data: { data: {
    id: 'recurring-1', categoryName: 'Cleaning', subcategoryName: 'Home Cleaning', providerName: null,
    frequency: 'weekly', preferredDay: 2, preferredTime: '09:00', status: 'active',
    servicePrice: 50000, serviceFee: 5000, totalAmount: 55000,
    nextScheduledDate: '2026-09-01', address: '1 Test Street', barangay: 'Lahug', city: 'Cebu City', province: 'Cebu',
    totalCompleted: 1, totalSkipped: 0, cancelReason: null, createdAt: '2026-08-01T00:00:00Z',
  } } });
});

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), push: mockPush }),
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

it('BUG-UX-165 — recurring history opens the linked customer booking', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><RecurringDetailScreen /></QueryClientProvider>);

  fireEvent.click(await screen.findByText('View History'));
  fireEvent.click(await screen.findByLabelText('Open booking from 2026-08-20'));

  expect(mockPush).toHaveBeenCalledWith('/customer/booking/booking-1');
});
