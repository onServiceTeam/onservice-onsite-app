import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({ bookingId: 'booking-1' }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1024, breakpoint: 'desktop', isPhone: false, isTablet: false, isDesktop: true }),
}));
jest.mock('@/services/booking.service', () => ({
  getBookingById: jest.fn().mockResolvedValue({
    id: 'booking-1', status: 'payment_pending', createdAt: '2026-08-24T00:00:00.000Z',
    serviceName: 'Aircon Cleaning', servicePrice: 100000, serviceFee: 0,
    sukiDiscount: 0, totalAmount: 100000,
  }),
}));
jest.mock('@/services/payment.service', () => ({
  createPaymentIntent: jest.fn(),
  getWalletBalance: jest.fn().mockResolvedValue({ availableBalance: 200000 }),
}));

import PayExistingBookingScreen from '../app/customer/booking/pay';

it('Bug UX-224 — existing-booking payment uses a bounded desktop workspace and does not promise confirmation-only escrow release', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><PayExistingBookingScreen /></QueryClientProvider>);

  expect(await screen.findByLabelText('Desktop booking payment workspace')).toBeTruthy();
  expect(screen.getByText(/Release follows customer confirmation or the platform completion timer/i)).toBeTruthy();
  expect(screen.queryByText(/held in secure escrow until the job is completed/i)).toBeNull();
});
