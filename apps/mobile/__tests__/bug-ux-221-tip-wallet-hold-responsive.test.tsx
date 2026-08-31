import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: jest.fn() }),
  useLocalSearchParams: () => ({ bookingId: 'booking-1' }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1280, breakpoint: 'desktop', isPhone: false, isTablet: false, isDesktop: true }),
}));
jest.mock('@/services/booking.service', () => ({
  getBookingById: jest.fn().mockResolvedValue({ id: 'booking-1', servicePrice: 100000, status: 'confirmed', providerId: 'provider-1' }),
}));
jest.mock('@/services/payment.service', () => ({
  getWalletBalance: jest.fn().mockResolvedValue({ availableBalance: 10000, pendingBalance: 0 }),
}));
jest.mock('@/services/tip.service', () => ({ sendTip: jest.fn() }));
jest.mock('@/services/api', () => ({
  __esModule: true,
  default: { get: jest.fn().mockResolvedValue({ data: { data: { minCents: 100, maxCents: 500000 } } }) },
}));

import TipScreen from '../app/customer/booking/tip';

it('Bug UX-221 — the desktop tip workspace explains a short existing wallet without recommending disabled top-up', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><TipScreen /></QueryClientProvider>);

  const workspace = await screen.findByLabelText('Desktop tip workspace');
  fireEvent.click(screen.getByText('20%'));

  expect(workspace).toBeTruthy();
  expect(screen.getByText(/Choose a smaller tip; new top-ups are temporarily unavailable/i)).toBeTruthy();
  expect(screen.queryByText(/top up first/i)).toBeNull();
});
