// HA-M2-187 (D38 Milestone 2, package P5b): once a pro has quoted, the
// request status screen says so and its button opens the quote.
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BOOKING_ID, ok, requestStatusFixture, routeGets } from '../test-support/request-fixtures';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({ bookingId: 'booking-req-1' }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 390, breakpoint: 'phone', isPhone: true, isTablet: false, isDesktop: false }),
}));
jest.mock('@/services/socket.service', () => require('../test-support/socket-mock').socketServiceMock);

import RequestStatusScreen from '../app/customer/booking/request-status';

it('HA-M2-187: a quote-ready request shows "You have a quote" and See the quote opens the quotes screen', async () => {
  routeGets({
    [`/api/v1/bookings/${BOOKING_ID}/request-status`]: ok(requestStatusFixture({ status: 'quoted', stage: 'quote_ready', openQuoteCount: 1 })),
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><RequestStatusScreen /></QueryClientProvider>);

  expect(await screen.findByText('You have a quote')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'See the quote' }));
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/customer/booking/quotes', params: { bookingId: BOOKING_ID } });
});
