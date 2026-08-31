import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({ bookingId: 'booking-complete' }),
}));
jest.mock('@/services/booking.service', () => ({
  getBookingById: jest.fn().mockResolvedValue({ id: 'booking-complete', servicePrice: 100000, status: 'confirmed', providerId: 'provider-1' }),
}));
jest.mock('@/services/payment.service', () => ({ getWalletBalance: jest.fn().mockRejectedValue(new Error('wallet unavailable')) }));
jest.mock('@/services/tip.service', () => ({ sendTip: jest.fn() }));
jest.mock('@/services/api', () => ({ __esModule: true, default: { get: jest.fn().mockResolvedValue({ data: { data: { minCents: 100, maxCents: 500000 } } }) } }));

import TipScreen from '../app/customer/booking/tip';

it('Bug UX-624 — the tip form fails closed when the wallet or live tip limit cannot be verified', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><TipScreen /></QueryClientProvider>);

  expect(await screen.findByText('Tip details unavailable')).toBeTruthy();
  expect(screen.getByText(/verify your wallet balance and the current tip limit/i)).toBeTruthy();
  expect(screen.queryByText('Wallet balance: ₱0.00')).toBeNull();
  expect(screen.queryByText('Send Tip')).toBeNull();
});
