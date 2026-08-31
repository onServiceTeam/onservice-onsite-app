import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockGetBookingById = jest.fn();
const mockGetWalletBalance = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));
jest.mock('@/services/booking.service', () => ({ getBookingById: (...args: unknown[]) => mockGetBookingById(...args) }));
jest.mock('@/services/payment.service', () => ({
  createPaymentIntent: jest.fn(),
  getWalletBalance: (...args: unknown[]) => mockGetWalletBalance(...args),
}));

import PayExistingBookingScreen from '../app/customer/booking/pay';

it('Bug UX-639 — quote payment without a booking ID does not fetch money context or offer an unusable network retry', () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><PayExistingBookingScreen /></QueryClientProvider>);

  expect(screen.getByText('Payment unavailable')).toBeTruthy();
  expect(screen.getByText(/does not identify a booking awaiting payment/i)).toBeTruthy();
  expect(mockGetBookingById).not.toHaveBeenCalled();
  expect(mockGetWalletBalance).not.toHaveBeenCalled();
});
