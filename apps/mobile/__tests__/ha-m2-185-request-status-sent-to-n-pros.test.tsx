// HA-M2-185 (D38 Milestone 2, package P5b): right after sending a request the
// customer reads "We sent your request to N local pros" (N = the pros the
// server notified this round), and what happens next: with one open quote
// per request, the first pro to respond sends a price and the earliest time.
import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BOOKING_ID, ok, requestStatusFixture, routeGets } from '../test-support/request-fixtures';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({ bookingId: 'booking-req-1' }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 390, breakpoint: 'phone', isPhone: true, isTablet: false, isDesktop: false }),
}));
jest.mock('@/services/socket.service', () => require('../test-support/socket-mock').socketServiceMock);

import RequestStatusScreen from '../app/customer/booking/request-status';

it('HA-M2-185: the waiting request says "We sent your request to N local pros" and what happens next', async () => {
  routeGets({
    [`/api/v1/bookings/${BOOKING_ID}/request-status`]: ok(requestStatusFixture({ stage: 'waiting', notifiedProviderCount: 4 })),
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><RequestStatusScreen /></QueryClientProvider>);

  expect(await screen.findByText('We sent your request to 4 local pros')).toBeTruthy();
  expect(screen.getByText('The first pro to respond sends you a price and the earliest time they can come. You then accept or decline. We will notify you when a quote arrives.')).toBeTruthy();
  expect(screen.queryByText('Still looking for a pro')).toBeNull();
  expect(screen.getByRole('button', { name: 'Cancel request' })).toBeTruthy();
});
