// HA-M2-549 (D38 Milestone 2, package P5b): after a decline, the customer is
// told what happens next from the server's answer (here: the request is open
// to other pros again), and, with no quote left to decide on, lands on the
// request status screen.
import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import api from '@/services/api';
import { useToastStore } from '@/components/ui';
import { BOOKING_ID, QUOTE_ID, ok, quoteFixture, routeGets } from '../test-support/request-fixtures';

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: mockReplace }),
  useLocalSearchParams: () => ({ bookingId: 'booking-req-1' }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 390, breakpoint: 'phone', isPhone: true, isTablet: false, isDesktop: false }),
}));
jest.mock('@/services/socket.service', () => require('../test-support/socket-mock').socketServiceMock);

import QuotesScreen from '../app/customer/booking/quotes';

it('HA-M2-549: a decline that reopens the request says so and goes to the request status screen', async () => {
  routeGets({ [`/api/v1/bookings/${BOOKING_ID}/quotes`]: ok([quoteFixture()]) });
  jest.mocked(api.post).mockReset();
  jest.mocked(api.post).mockResolvedValue({ data: { success: true, data: { quoteId: QUOTE_ID, bookingStatus: 'requested', round: 2, reopened: true, opsReview: false } } } as never);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><QuotesScreen /></QueryClientProvider>);

  fireEvent.click(await screen.findByRole('button', { name: 'Decline quote from Cebu Cooling' }));
  const sheet = screen.getByLabelText('Decline this quote');
  fireEvent.click(within(sheet).getByRole('radio', { name: 'Price too high' }));
  fireEvent.click(within(sheet).getByRole('button', { name: 'Decline quote' }));

  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith({
    pathname: '/customer/booking/request-status',
    params: { bookingId: BOOKING_ID },
  }));
  expect(useToastStore.getState().message).toBe('Quote declined. We let the pro know, and your request is open to other pros again.');
});
