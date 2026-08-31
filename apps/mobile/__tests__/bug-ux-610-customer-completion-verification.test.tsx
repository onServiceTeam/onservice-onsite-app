import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), replace: jest.fn(), push: jest.fn() }),
  useLocalSearchParams: () => ({ bookingId: 'booking-1' }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1100, breakpoint: 'desktop', isPhone: false, isTablet: false, isDesktop: true }),
}));
jest.mock('@/services/booking.service', () => ({
  getBookingById: jest.fn().mockRejectedValue(new Error('booking unavailable')),
}));
jest.mock('@/services/api', () => ({
  __esModule: true,
  default: { patch: jest.fn() },
}));

import JobCompletionScreen from '../app/customer/booking/complete';

it('Bug UX-610 — customer completion controls stay unavailable until the completed booking is verified', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><JobCompletionScreen /></QueryClientProvider>);

  expect(await screen.findByText(/couldn't verify this completed booking/i)).toBeTruthy();
  expect(screen.queryByText('Yes, looks great!')).toBeNull();
  expect(screen.queryByText(/payment will be released/i)).toBeNull();
});
