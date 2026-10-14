// HA-M2-552 (D38 Milestone 2, package P5b; E83 interim default): the confirm
// screen tells the customer when to be available, from the job time the
// server would set if they confirm now (slot.startsAt, the later of the
// window start and confirmation plus the lead time), shown on the Manila
// clock.
import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BOOKING_ID, NOW, QUOTE_ID, confirmPreviewFixture, ok, routeGets } from '../test-support/request-fixtures';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({ bookingId: 'booking-req-1', quoteId: 'quote-1' }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 390, breakpoint: 'phone', isPhone: true, isTablet: false, isDesktop: false }),
}));

import ConfirmQuoteScreen from '../app/customer/booking/confirm-quote';

afterEach(() => jest.restoreAllMocks());

it('HA-M2-552: the confirm screen says "Be available from" the server\'s job time in Manila time', async () => {
  jest.spyOn(Date, 'now').mockReturnValue(NOW);
  routeGets({
    // Tomorrow's morning window starts 8:00 AM Manila (00:00 UTC).
    [`/api/v1/bookings/${BOOKING_ID}/quotes/${QUOTE_ID}/confirm-preview`]: ok(confirmPreviewFixture({
      slot: { date: '2026-10-15', window: 'morning', startsAt: '2026-10-15T00:00:00.000Z', status: 'ok' },
    })),
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><ConfirmQuoteScreen /></QueryClientProvider>);

  expect(await screen.findByText('Be available from 8:00 AM, tomorrow.')).toBeTruthy();
});
