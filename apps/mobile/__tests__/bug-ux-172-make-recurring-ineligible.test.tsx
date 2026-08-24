import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockPreviewGet = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: jest.fn() }),
  useLocalSearchParams: () => ({ bookingId: 'booking-quote' }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 390, breakpoint: 'phone', isPhone: true, isTablet: false, isDesktop: false }),
}));
jest.mock('@/services/booking.service', () => ({
  getBookingById: jest.fn().mockResolvedValue({
    id: 'booking-quote', categoryId: 'category-1', subcategoryId: 'subcategory-1',
    providerId: 'provider-1', bookingType: 'quote_based', scheduledAt: '2026-08-20T01:00:00Z',
  }),
}));
jest.mock('@/services/api', () => ({
  __esModule: true,
  default: { get: (...args: unknown[]) => mockPreviewGet(...args), post: jest.fn() },
}));
jest.mock('@/lib/toast', () => ({ showToast: jest.fn() }));

import MakeRecurringScreen from '../app/customer/booking/make-recurring';

it('BUG-UX-172 — recurring setup stops an ineligible quote service before any price or create request', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><MakeRecurringScreen /></QueryClientProvider>);

  expect(await screen.findByText('This service can’t repeat automatically')).toBeTruthy();
  expect(screen.getByText('Back to Bookings')).toBeTruthy();
  expect(mockPreviewGet).not.toHaveBeenCalled();
});
