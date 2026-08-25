import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: jest.fn() }),
  useLocalSearchParams: () => ({ bookingId: 'booking-1' }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 390, breakpoint: 'phone', isPhone: true, isTablet: false, isDesktop: false }),
}));
jest.mock('@/services/booking.service', () => ({ getBookingById: jest.fn().mockResolvedValue({ id: 'booking-1', servicePrice: 100000 }) }));
jest.mock('@/services/payment.service', () => ({ getWalletBalance: jest.fn().mockResolvedValue({ availableBalance: 500000, pendingBalance: 0 }) }));
jest.mock('@/services/tip.service', () => ({ sendTip: jest.fn() }));
jest.mock('@/services/api', () => ({ __esModule: true, default: { get: jest.fn().mockResolvedValue({ data: { data: { minCents: 100, maxCents: 500000 } } }) } }));

import TipScreen from '../app/customer/booking/tip';

it('Bug UX-390 — the long tip form scrolls and exposes named preset, custom-amount, and message controls on a phone browser', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><TipScreen /></QueryClientProvider>);

  expect(await screen.findByLabelText('Scrollable tip form')).toBeTruthy();
  expect(screen.getByRole('button', { name: /Tip 10 percent/i })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Enter a custom tip amount' }));
  expect(screen.getByLabelText('Custom tip amount')).toBeTruthy();
  expect(screen.getByLabelText('Optional tip message').getAttribute('maxlength')).toBe('500');
});
