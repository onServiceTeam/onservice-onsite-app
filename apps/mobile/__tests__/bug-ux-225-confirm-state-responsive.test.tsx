import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { getBookingById } from '@/services/booking.service';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({ bookingId: 'booking-1' }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1280, breakpoint: 'desktop', isPhone: false, isTablet: false, isDesktop: true }),
}));
jest.mock('@/services/booking.service', () => ({ getBookingById: jest.fn() }));

import BookingConfirmScreen from '../app/customer/booking/confirm';

function renderConfirm(): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><BookingConfirmScreen /></QueryClientProvider>);
}

it('Bug UX-225 — booking confirmation only claims held escrow when the server record reports held and remains usable on desktop', async () => {
  jest.mocked(getBookingById).mockResolvedValueOnce({
    id: 'booking-1', status: 'payment_pending', escrowStatus: 'none', totalAmount: 100000,
  } as never);
  renderConfirm();
  expect(await screen.findByLabelText('Desktop booking confirmation workspace')).toBeTruthy();
  expect(await screen.findByText('Booking Submitted!')).toBeTruthy();
  expect(screen.queryByText(/currently shows escrow held/i)).toBeNull();

  cleanup();
  jest.mocked(getBookingById).mockResolvedValueOnce({
    id: 'booking-1', status: 'paid', escrowStatus: 'held', totalAmount: 100000,
  } as never);
  renderConfirm();
  expect(await screen.findByText(/This booking currently shows escrow held/i)).toBeTruthy();
  expect(screen.getByText(/platform completion timer/i)).toBeTruthy();
});
