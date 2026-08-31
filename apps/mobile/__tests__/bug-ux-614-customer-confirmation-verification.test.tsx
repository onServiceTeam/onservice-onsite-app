import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
  useLocalSearchParams: () => ({ bookingId: 'booking-1' }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1100, breakpoint: 'desktop', isPhone: false, isTablet: false, isDesktop: true }),
}));
jest.mock('@/services/booking.service', () => ({
  getBookingById: jest.fn().mockRejectedValue(new Error('booking unavailable')),
}));

import BookingConfirmScreen from '../app/customer/booking/confirm';

it('Bug UX-614 — booking confirmation does not claim success when the booking cannot be verified', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><BookingConfirmScreen /></QueryClientProvider>);

  expect(await screen.findByText(/couldn't verify this booking/i)).toBeTruthy();
  expect(screen.queryByText('Booking Submitted!')).toBeNull();
  expect(screen.queryByText('Booking Confirmed!')).toBeNull();
});
