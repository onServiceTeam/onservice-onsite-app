// HA-M2-547 (D38 Milestone 2, package P5b): while the live connection is
// down, the request status screen re-reads every requestProviderPollSeconds
// (30 by default) so the customer still sees a quote arrive; while it is up,
// it does not poll (events do the work, and the API allows 100 requests per
// user per 15 minutes).
import React from 'react';
import { act, render, screen } from '@testing-library/react';
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
const statusReads = (): number => jest.mocked(api.get).mock.calls.filter((call) => call[0] === STATUS_URL).length;

afterEach(() => {
  jest.useRealTimers();
  socketMock.reset();
});

it('HA-M2-547: the request status polls every 30 s while disconnected and not at all while connected', async () => {
  jest.useFakeTimers({ now: Date.parse('2026-10-14T01:00:00.000Z') });
  // The round opened just now, so the one-off still-looking check is 30 minutes away.
  routeGets({ [STATUS_URL]: ok(requestStatusFixture({ stage: 'waiting', roundOpenedAt: '2026-10-14T01:00:00.000Z' })) });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><RequestStatusScreen /></QueryClientProvider>);
  await act(async () => { await jest.advanceTimersByTimeAsync(50); });
  expect(screen.getByText('We sent your request to 4 local pros')).toBeTruthy();
  const start = statusReads();

  await act(async () => { await jest.advanceTimersByTimeAsync(30_100); });
  expect(statusReads()).toBe(start + 1);

  act(() => { socketMock.setConnected(true); });
  await act(async () => { await jest.advanceTimersByTimeAsync(5 * 60_000); });
  expect(statusReads()).toBe(start + 1);

  act(() => { socketMock.setConnected(false); });
  await act(async () => { await jest.advanceTimersByTimeAsync(30_100); });
  expect(statusReads()).toBe(start + 2);
});
