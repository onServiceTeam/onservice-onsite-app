// HA-M2-193 (D38 Milestone 2, package P5b): with no quote yet, the quotes
// screen says what is true ("Quotes appear here as soon as a pro responds.
// We also add them to your notifications."), not the old promise that
// "Providers will send quotes soon", and points to the request status.
//
// P5b review: the single-quote explanation promised "decline and we will
// send your request to other pros", but on the last allowed round a decline
// sends to nobody (the back office is asked instead). It now says only what
// always happens; the toast after a decline follows the server's answer.
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BOOKING_ID, ok, quoteFixture, routeGets } from '../test-support/request-fixtures';

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

it('HA-M2-193: the quotes screen says what is true and makes none of the old promises (no quote yet, or one quote)', async () => {
  routeGets({ [`/api/v1/bookings/${BOOKING_ID}/quotes`]: ok([]) });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const { container, unmount } = render(<QueryClientProvider client={client}><QuotesScreen /></QueryClientProvider>);

  expect(await screen.findByText('Quotes appear here as soon as a pro responds. We also add them to your notifications.')).toBeTruthy();
  expect(container.textContent).not.toContain('Providers will send quotes soon');
  expect(container.textContent).not.toContain('This cannot be undone. The provider will see your decision.');
  fireEvent.click(screen.getByText('See request status'));
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/customer/booking/request-status', params: { bookingId: BOOKING_ID } });
  unmount();

  // One quote: no promise that a decline always sends the request on.
  routeGets({ [`/api/v1/bookings/${BOOKING_ID}/quotes`]: ok([quoteFixture()]) });
  const single = render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}><QuotesScreen /></QueryClientProvider>);
  expect(await screen.findByText('This pro responded to your request. Accept and book to see the full total and confirm, or decline it and tell us why.')).toBeTruthy();
  expect(single.container.textContent).not.toMatch(/we will send your request to other pros/i);
});
