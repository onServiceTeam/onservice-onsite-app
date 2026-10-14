// HA-M2-562 (D38 Milestone 2, package P5b): if the quote is no longer live
// when Confirm booking opens (409 QUOTE_NOT_AVAILABLE: it expired or the pro
// withdrew it), the customer is told so plainly and sent back to the
// request, with no price or Confirm button shown.
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BOOKING_ID, QUOTE_ID, apiError, routeGets } from '../test-support/request-fixtures';

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: mockReplace }),
  useLocalSearchParams: () => ({ bookingId: 'booking-req-1', quoteId: 'quote-1' }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 390, breakpoint: 'phone', isPhone: true, isTablet: false, isDesktop: false }),
}));

import ConfirmQuoteScreen from '../app/customer/booking/confirm-quote';

it('HA-M2-562: a quote that is no longer available says so and leads back to the request status', async () => {
  routeGets({
    [`/api/v1/bookings/${BOOKING_ID}/quotes/${QUOTE_ID}/confirm-preview`]: apiError(409, 'QUOTE_NOT_AVAILABLE', 'This quote is no longer available.'),
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><ConfirmQuoteScreen /></QueryClientProvider>);

  expect(await screen.findByText('Quote no longer available')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Confirm booking' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'See request status' }));
  expect(mockReplace).toHaveBeenCalledWith({ pathname: '/customer/booking/request-status', params: { bookingId: BOOKING_ID } });
});
