// HA-M2-192 (D38 Milestone 2, package P5b): declining a quote asks for a
// reason in a sheet (a real dialog that works on the web app, no
// Alert.alert), and the decline request carries the chosen reason and the
// optional note (POST .../decline {reason, note}).
import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Alert } from 'react-native';
import api from '@/services/api';
import { BOOKING_ID, QUOTE_ID, ok, quoteFixture, routeGets } from '../test-support/request-fixtures';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({ bookingId: 'booking-req-1' }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 390, breakpoint: 'phone', isPhone: true, isTablet: false, isDesktop: false }),
}));
jest.mock('@/services/socket.service', () => require('../test-support/socket-mock').socketServiceMock);

import QuotesScreen from '../app/customer/booking/quotes';

it('HA-M2-192: the decline sheet sends the reason the customer picked, with their note', async () => {
  routeGets({ [`/api/v1/bookings/${BOOKING_ID}/quotes`]: ok([quoteFixture()]) });
  jest.mocked(api.post).mockReset();
  jest.mocked(api.post).mockResolvedValue({ data: { success: true, data: { quoteId: QUOTE_ID, bookingStatus: 'requested', round: 2, reopened: true, opsReview: false } } } as never);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><QuotesScreen /></QueryClientProvider>);

  fireEvent.click(await screen.findByRole('button', { name: 'Decline quote from Cebu Cooling' }));
  const sheet = screen.getByLabelText('Decline this quote');
  expect(within(sheet).getByText('Why are you declining?')).toBeTruthy();
  fireEvent.click(within(sheet).getByRole('radio', { name: 'Timing does not work' }));
  fireEvent.change(within(sheet).getByLabelText('Note for onService'), { target: { value: 'I need it done this weekend.' } });
  fireEvent.click(within(sheet).getByRole('button', { name: 'Decline quote' }));

  await waitFor(() => expect(api.post).toHaveBeenCalledWith(
    `/api/v1/bookings/${BOOKING_ID}/quotes/${QUOTE_ID}/decline`,
    { reason: 'timing', note: 'I need it done this weekend.' },
  ));
  expect(Alert.alert).not.toHaveBeenCalled();
});
