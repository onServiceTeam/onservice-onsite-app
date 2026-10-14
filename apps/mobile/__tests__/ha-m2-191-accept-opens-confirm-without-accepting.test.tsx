// HA-M2-191 (D38 Milestone 2, package P5b): "Accept and book" opens the
// Confirm booking screen for that quote and does not accept anything yet:
// the customer sees the total, the time and the cancellation summary first.
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import api from '@/services/api';
import { BOOKING_ID, QUOTE_ID, ok, quoteFixture, routeGets } from '../test-support/request-fixtures';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({ bookingId: 'booking-req-1' }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 390, breakpoint: 'phone', isPhone: true, isTablet: false, isDesktop: false }),
}));
jest.mock('@/services/socket.service', () => require('../test-support/socket-mock').socketServiceMock);

import QuotesScreen from '../app/customer/booking/quotes';

it('HA-M2-191: Accept and book opens the confirm screen for that quote and sends no accept request', async () => {
  routeGets({ [`/api/v1/bookings/${BOOKING_ID}/quotes`]: ok([quoteFixture()]) });
  jest.mocked(api.post).mockClear();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><QuotesScreen /></QueryClientProvider>);

  fireEvent.click(await screen.findByRole('button', { name: 'Accept and book Cebu Cooling' }));

  expect(mockPush).toHaveBeenCalledWith({
    pathname: '/customer/booking/confirm-quote',
    params: { bookingId: BOOKING_ID, quoteId: QUOTE_ID },
  });
  expect(api.post).not.toHaveBeenCalled();
});
