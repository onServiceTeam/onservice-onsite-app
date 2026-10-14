// HA-M2-567 (D38 Milestone 2, package P5b, review fix): the server sends a
// new request to pros just after it answers the customer's submit, and it
// does not emit request:updated after a normal send. The status screen's
// first read can land before the invites exist and say "Your request is open
// to local pros". With the live connection up (no polling) and no event, the
// promised "We sent your request to N local pros" never came. Now, when a
// fresh round shows no pros sent yet, the screen asks again a few seconds
// later.
import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BOOKING_ID, NOW, ok, requestStatusFixture, routeGets } from '../test-support/request-fixtures';
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

afterEach(() => {
  socketMock.reset();
  jest.restoreAllMocks();
});

it('HA-M2-567: a fresh request read before the send finishes asks again and then shows "We sent your request to N local pros"', async () => {
  jest.spyOn(Date, 'now').mockReturnValue(NOW);
  // Connected: no polling, and the server emits nothing after a normal send.
  socketMock.setConnected(true);
  let reads = 0;
  routeGets({
    [`/api/v1/bookings/${BOOKING_ID}/request-status`]: () => {
      reads += 1;
      return ok(requestStatusFixture({
        roundOpenedAt: new Date(NOW - 2_000).toISOString(),
        // The first read lands before the invites are written.
        notifiedProviderCount: reads === 1 ? 0 : 5,
      }));
    },
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><RequestStatusScreen /></QueryClientProvider>);

  expect(await screen.findByText('Your request is open to local pros')).toBeTruthy();
  expect(await screen.findByText('We sent your request to 5 local pros', undefined, { timeout: 6_000 })).toBeTruthy();
  expect(reads).toBe(2);
}, 15_000);
