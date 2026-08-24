import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockPost = jest.fn().mockResolvedValue({ data: { data: { id: 'recurring-1' } } });

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: jest.fn() }),
  useLocalSearchParams: () => ({ bookingId: 'booking-1' }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 390, breakpoint: 'phone', isPhone: true, isTablet: false, isDesktop: false }),
}));
jest.mock('@/services/booking.service', () => ({
  getBookingById: jest.fn().mockResolvedValue({
    id: 'booking-1', categoryId: 'category-1', subcategoryId: 'subcategory-1',
    providerId: 'provider-1', bookingType: 'fixed_price', scheduledAt: '2026-08-20T01:00:00Z',
    serviceName: 'Home Cleaning', totalAmount: 55000,
    address: '1 Test Street', barangay: 'Lahug', city: 'Cebu City', province: 'Cebu', latitude: 10.3, longitude: 123.9,
  }),
}));
jest.mock('@/services/api', () => ({
  __esModule: true,
  default: {
    get: jest.fn().mockResolvedValue({ data: { data: { servicePrice: 50000, serviceFee: 5000, totalAmount: 55000 } } }),
    post: (...args: unknown[]) => mockPost(...args),
  },
}));
jest.mock('@/lib/toast', () => ({ showToast: jest.fn() }));

import MakeRecurringScreen from '../app/customer/booking/make-recurring';

it('BUG-UX-173 — customer can choose the recurring visit time sent to the server', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><MakeRecurringScreen /></QueryClientProvider>);

  fireEvent.click(await screen.findByRole('radio', { name: '14:00' }));
  fireEvent.click(screen.getByText('Set Up Weekly Booking'));

  await waitFor(() => expect(mockPost).toHaveBeenCalledWith('/api/v1/recurring', expect.objectContaining({ preferredTime: '14:00' })));
});
