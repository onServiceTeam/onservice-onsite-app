import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: jest.fn() }),
  useLocalSearchParams: () => ({ bookingId: 'booking-1' }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1180, breakpoint: 'desktop', isPhone: false, isTablet: false, isDesktop: true }),
}));
jest.mock('@/services/booking.service', () => ({
  getBookingById: jest.fn().mockResolvedValue({
    id: 'booking-1', categoryId: 'category-1', subcategoryId: 'subcategory-1',
    providerId: 'provider-1', bookingType: 'fixed_price', scheduledAt: '2026-08-20T01:00:00Z',
    serviceName: 'Home Cleaning', categoryName: 'Cleaning', totalAmount: 49000,
    address: '1 Test Street', barangay: 'Lahug', city: 'Cebu City', province: 'Cebu',
    latitude: 10.31, longitude: 123.89,
  }),
}));
jest.mock('@/services/api', () => ({
  __esModule: true,
  default: {
    get: jest.fn().mockResolvedValue({ data: { data: { servicePrice: 50000, serviceFee: 5000, totalAmount: 55000 } } }),
    post: jest.fn(),
  },
}));
jest.mock('@/lib/toast', () => ({ showToast: jest.fn() }));

import MakeRecurringScreen from '../app/customer/booking/make-recurring';

it('BUG-UX-171 — recurring setup shows the server preview in a desktop workspace instead of the old booking total', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><MakeRecurringScreen /></QueryClientProvider>);

  expect(await screen.findByLabelText('Tablet and desktop recurring setup workspace')).toBeTruthy();
  expect(screen.getByText('₱550.00')).toBeTruthy();
  expect(screen.queryByText('₱490.00')).toBeNull();
  expect(screen.getByText('Service ₱500.00')).toBeTruthy();
  expect(screen.getByText('Fee ₱50.00')).toBeTruthy();
});
