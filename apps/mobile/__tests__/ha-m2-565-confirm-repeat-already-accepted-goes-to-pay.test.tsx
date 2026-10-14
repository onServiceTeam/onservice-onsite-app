// HA-M2-565 (D38 Milestone 2, package P5b, review fix): Confirm booking on a
// slow connection. An accept can reach the server and be saved while its
// answer never comes back (a timeout). Accept is not idempotent: a repeat
// tap gets a plain 409 ("Booking is not in a state to accept quotes"), with
// no code. Before the fix the screen read that 409 as "Quote no longer
// available... the pro withdrew it" while the booking was in fact waiting
// for payment. Now, after a timeout or a plain 409, the screen checks the
// quote on the server and, when it is already accepted, goes on to payment.
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import api from '@/services/api';
import {
  BOOKING_ID,
  QUOTE_ID,
  apiError,
  confirmPreviewFixture,
  ok,
  quoteFixture,
  routeGets,
} from '../test-support/request-fixtures';

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: mockReplace }),
  useLocalSearchParams: () => ({ bookingId: 'booking-req-1', quoteId: 'quote-1' }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 390, breakpoint: 'phone', isPhone: true, isTablet: false, isDesktop: false }),
}));

import ConfirmQuoteScreen from '../app/customer/booking/confirm-quote';

const PAY = { pathname: '/customer/booking/pay', params: { bookingId: BOOKING_ID } };

async function confirmWith(acceptFailure: Error): Promise<ReturnType<typeof render>> {
  mockReplace.mockClear();
  routeGets({
    [`/api/v1/bookings/${BOOKING_ID}/quotes/${QUOTE_ID}/confirm-preview`]: ok(confirmPreviewFixture()),
    // The server already holds this quote as accepted.
    [`/api/v1/bookings/${BOOKING_ID}/quotes`]: ok([quoteFixture({ status: 'accepted' })]),
  });
  jest.mocked(api.post).mockReset();
  jest.mocked(api.post).mockRejectedValue(acceptFailure);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const view = render(<QueryClientProvider client={client}><ConfirmQuoteScreen /></QueryClientProvider>);
  fireEvent.click(await screen.findByRole('button', { name: 'Confirm booking' }));
  return view;
}

it('HA-M2-565: an accept the server already saved goes to payment, not "Quote no longer available"', async () => {
  // The repeat tap: a plain 409 with no code.
  const repeat = await confirmWith(apiError(409, null, 'Booking is not in a state to accept quotes.'));
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith(PAY));
  expect(screen.queryByText('Quote no longer available')).toBeNull();
  repeat.unmount();

  // The first tap: saved on the server, answer lost (no response, status 0).
  await confirmWith(new Error('The request took too long.'));
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith(PAY));
  expect(screen.queryByText('Quote no longer available')).toBeNull();
});
