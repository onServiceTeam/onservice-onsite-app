// HA-M2-548 (D38 Milestone 2, package P5b): Message on a quote card opens the
// customer's thread with that pro (the chat route names the pro with
// ?provider=, since a request can have one thread per pro).
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BOOKING_ID, PROVIDER_USER_ID, ok, quoteFixture, routeGets } from '../test-support/request-fixtures';

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

it('HA-M2-548: Message on the quote card opens the chat with that pro', async () => {
  routeGets({ [`/api/v1/bookings/${BOOKING_ID}/quotes`]: ok([quoteFixture()]) });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><QuotesScreen /></QueryClientProvider>);

  fireEvent.click(await screen.findByRole('button', { name: 'Message Cebu Cooling' }));
  expect(mockPush).toHaveBeenCalledWith(`/customer/chat/${BOOKING_ID}?provider=${PROVIDER_USER_ID}`);
});
