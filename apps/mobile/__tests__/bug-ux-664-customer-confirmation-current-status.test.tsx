import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
  useLocalSearchParams: () => ({ bookingId: 'booking-disputed' }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1280, breakpoint: 'desktop', isPhone: false, isTablet: false, isDesktop: true }),
}));
jest.mock('@/services/booking.service', () => ({
  getBookingById: jest.fn().mockResolvedValue({
    id: 'booking-disputed',
    status: 'disputed',
    escrowStatus: 'held',
    categoryName: 'Aircon Cleaning',
    totalAmount: 125000,
  }),
}));

import BookingConfirmScreen from '../app/customer/booking/confirm';

it('Bug UX-664 — a later booking state cannot reuse confirmation, payment, or matching claims', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><BookingConfirmScreen /></QueryClientProvider>);

  expect(await screen.findByText('Booking Status Updated')).toBeTruthy();
  expect(screen.getByText(/This booking is now Disputed/i)).toBeTruthy();
  expect(screen.queryByText('Booking Confirmed!')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Complete Payment' })).toBeNull();
  expect(screen.queryByText("We'll match you with a verified provider in your area")).toBeNull();
});
