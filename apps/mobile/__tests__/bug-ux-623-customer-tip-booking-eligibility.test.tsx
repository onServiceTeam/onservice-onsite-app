import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({ bookingId: 'booking-active' }),
}));
jest.mock('@/services/booking.service', () => ({
  getBookingById: jest.fn().mockResolvedValue({ id: 'booking-active', servicePrice: 100000, status: 'in_progress', providerId: 'provider-1' }),
}));
jest.mock('@/services/payment.service', () => ({ getWalletBalance: jest.fn().mockResolvedValue({ availableBalance: 200000 }) }));
jest.mock('@/services/tip.service', () => ({ sendTip: jest.fn() }));
jest.mock('@/services/api', () => ({ __esModule: true, default: { get: jest.fn().mockResolvedValue({ data: { data: { minCents: 100, maxCents: 500000 } } }) } }));

import TipScreen from '../app/customer/booking/tip';

it('Bug UX-623 — an active booking cannot expose the provider tip form before work completion', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><TipScreen /></QueryClientProvider>);

  expect(await screen.findByText('Tip not available for this booking')).toBeTruthy();
  expect(screen.getByText(/only after the assigned provider completes the work/i)).toBeTruthy();
  expect(screen.queryByText('Tip Your Provider')).toBeNull();
});
