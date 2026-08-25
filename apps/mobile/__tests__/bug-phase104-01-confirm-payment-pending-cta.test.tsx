import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockReplace = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: mockReplace, push: jest.fn() }),
  useLocalSearchParams: () => ({ bookingId: 'booking-payment-pending' }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 390, breakpoint: 'phone', isPhone: true, isTablet: false, isDesktop: false }),
}));
jest.mock('@/services/booking.service', () => ({
  getBookingById: jest.fn().mockResolvedValue({
    id: 'booking-payment-pending',
    status: 'payment_pending',
    escrowStatus: 'pending',
    categoryName: 'Aircon Cleaning',
    totalAmount: 125000,
    scheduledAt: '2026-08-28T01:00:00.000Z',
    address: '22 Mango Avenue, Cebu City',
  }),
}));

import BookingConfirmScreen from '../app/customer/booking/confirm';

it('Bug PHASE104-01 — an unpaid confirmation renders a direct primary payment action that opens the existing-booking payment screen', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><BookingConfirmScreen /></QueryClientProvider>);

  expect(await screen.findByText('Aircon Cleaning')).toBeTruthy();
  expect(screen.getByText('Complete your payment to confirm this booking.')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Complete Payment' }));

  expect(mockReplace).toHaveBeenCalledWith({
    pathname: '/customer/booking/pay',
    params: { bookingId: 'booking-payment-pending' },
  });
  expect(screen.getByRole('button', { name: 'View Booking' })).toBeTruthy();
});
