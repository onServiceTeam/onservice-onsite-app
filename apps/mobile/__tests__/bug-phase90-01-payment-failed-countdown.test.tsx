import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), replace: jest.fn(), push: jest.fn() }),
  useLocalSearchParams: () => ({ bookingId: 'booking-five-hours-old' }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 390, breakpoint: 'phone', isPhone: true, isTablet: false, isDesktop: false }),
}));
jest.mock('@/services/booking.service', () => ({
  getBookingById: jest.fn().mockImplementation(async () => ({
    id: 'booking-five-hours-old',
    createdAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
  })),
}));

import PaymentFailedScreen from '../app/customer/booking/payment-failed';

it('Bug PHASE90-01 — payment recovery countdown renders from the booking creation deadline instead of restarting at 72 hours', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><PaymentFailedScreen /></QueryClientProvider>);

  await waitFor(() => {
    expect(screen.getByText(/6[67]h [0-5][0-9]m/)).toBeTruthy();
  });
  expect(screen.queryByText('72h 00m')).toBeNull();
});
