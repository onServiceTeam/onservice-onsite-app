import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), replace: jest.fn(), push: jest.fn() }),
  useLocalSearchParams: () => ({ bookingId: 'booking-1', reason: 'Card authorization was declined.' }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 820, breakpoint: 'tablet', isPhone: false, isTablet: true, isDesktop: false }),
}));
jest.mock('@/services/booking.service', () => ({
  getBookingById: jest.fn().mockResolvedValue({
    id: 'booking-1',
    status: 'payment_pending',
    createdAt: '2026-08-24T00:00:00.000Z',
  }),
}));

import PaymentFailedScreen from '../app/customer/booking/payment-failed';

it('Bug UX-378 — tablet payment failure presents one bounded recovery workspace with retry, alternate method, and linked support actions', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><PaymentFailedScreen /></QueryClientProvider>);

  expect(await screen.findByLabelText('Wide payment recovery workspace')).toBeTruthy();
  expect(screen.getByText('Card authorization was declined.')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Retry booking payment' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Use a different payment method' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Contact support about payment failure' })).toBeTruthy();
  expect(screen.getByText(/Your booking is held for up to 72 hours/i)).toBeTruthy();
});
