import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), replace: jest.fn(), push: jest.fn() }),
  useLocalSearchParams: () => ({ bookingId: 'booking-1', reason: 'Payment was not completed' }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1100, breakpoint: 'desktop', isPhone: false, isTablet: false, isDesktop: true }),
}));
jest.mock('@/services/booking.service', () => ({
  getBookingById: jest.fn().mockRejectedValue(new Error('booking unavailable')),
}));

import PaymentFailedScreen from '../app/customer/booking/payment-failed';

it('Bug UX-611 — payment retry controls stay unavailable when payment-pending status cannot be verified', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><PaymentFailedScreen /></QueryClientProvider>);

  expect(await screen.findByText(/couldn't verify that this booking is still awaiting payment/i)).toBeTruthy();
  expect(screen.queryByText('Retry Payment')).toBeNull();
  expect(screen.queryByText(/booking is still saved/i)).toBeNull();
});
