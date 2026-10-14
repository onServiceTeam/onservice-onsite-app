// HA-M2-536 (D38 Milestone 2, package P5b): from the provider's read-only
// quote, "Message customer" opens this pro's thread for the request (the
// provider chat route takes the booking id).
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BOOKING_ID, QUOTE_ID, ok, providerRequestFixture, quoteFixture, quoteScreenGets } from '../test-support/request-fixtures';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'booking-req-1' }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 390, breakpoint: 'phone', isPhone: true, isTablet: false, isDesktop: false }),
}));
jest.mock('@/services/socket.service', () => require('../test-support/socket-mock').socketServiceMock);

import QuoteBuilderScreen from '../app/provider/job/[id]/quote';

it('HA-M2-536: Message customer on the read-only quote opens the provider chat for this request', async () => {
  quoteScreenGets(providerRequestFixture({
    myQuote: { id: QUOTE_ID, status: 'declined', quotedPrice: 180000, earliestDate: '2026-10-15', earliestTimeWindow: 'morning' },
  }), {
    [`/api/v1/bookings/${BOOKING_ID}/quotes`]: ok([quoteFixture({ status: 'declined' })]),
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><QuoteBuilderScreen /></QueryClientProvider>);

  expect(await screen.findByText('Not accepted')).toBeTruthy();
  // A declined quote cannot be withdrawn.
  expect(screen.queryByRole('button', { name: 'Withdraw quote' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Message customer' }));
  expect(mockPush).toHaveBeenCalledWith(`/provider/chat/${BOOKING_ID}`);
});
