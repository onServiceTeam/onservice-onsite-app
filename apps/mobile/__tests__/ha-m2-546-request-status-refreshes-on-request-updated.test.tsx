// HA-M2-546 (D38 Milestone 2, package P5b): the request status screen
// follows the request live: a request:updated event for this request
// re-reads the status at once (here a quote has arrived). An event for some
// other request does not.
import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import api from '@/services/api';
import { BOOKING_ID, ok, requestStatusFixture, routeGets } from '../test-support/request-fixtures';
import { socketMock } from '../test-support/socket-mock';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({ bookingId: 'booking-req-1' }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 390, breakpoint: 'phone', isPhone: true, isTablet: false, isDesktop: false }),
}));
jest.mock('@/services/socket.service', () => require('../test-support/socket-mock').socketServiceMock);

import RequestStatusScreen from '../app/customer/booking/request-status';

const STATUS_URL = `/api/v1/bookings/${BOOKING_ID}/request-status`;

afterEach(() => socketMock.reset());

it('HA-M2-546: request:updated for this request re-reads the status and shows the new stage; another request\'s event does not', async () => {
  let current = requestStatusFixture({ stage: 'waiting', notifiedProviderCount: 3 });
  routeGets({ [STATUS_URL]: () => ok(current) });
  const statusReads = (): number => jest.mocked(api.get).mock.calls.filter((call) => call[0] === STATUS_URL).length;
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><RequestStatusScreen /></QueryClientProvider>);
  expect(await screen.findByText('We sent your request to 3 local pros')).toBeTruthy();
  const reads = statusReads();

  current = requestStatusFixture({ status: 'quoted', stage: 'quote_ready', openQuoteCount: 1 });
  act(() => { socketMock.serve('request:updated', { bookingId: 'another-request', status: 'quoted', stage: 'quote_ready', round: 1, opsReview: false }); });
  expect(statusReads()).toBe(reads);

  act(() => { socketMock.serve('request:updated', { bookingId: BOOKING_ID, status: 'quoted', stage: 'quote_ready', round: 1, opsReview: false }); });
  expect(await screen.findByText('You have a quote')).toBeTruthy();
  await waitFor(() => expect(statusReads()).toBe(reads + 1));
});
