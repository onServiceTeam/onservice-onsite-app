// HA-M2-542 (D38 Milestone 2, package P5b): after the customer declined a
// quote and the request went out again, the status screen says "We sent your
// request to more pros", with how many were told this round.
//
// P5b review: the server also reports stage 'reopened' when nothing was
// sent: a decline on the last allowed round (the back office is asked
// instead), a round that found nobody to invite, or the silent reopen of an
// old request. Then the screen must not claim a send: no "We sent your
// request to more pros" and no live "Sent just now" line.
import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BOOKING_ID, NOW, ok, requestStatusFixture, routeGets } from '../test-support/request-fixtures';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({ bookingId: 'booking-req-1' }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 390, breakpoint: 'phone', isPhone: true, isTablet: false, isDesktop: false }),
}));
jest.mock('@/services/socket.service', () => require('../test-support/socket-mock').socketServiceMock);

import RequestStatusScreen from '../app/customer/booking/request-status';

afterEach(() => jest.restoreAllMocks());

function renderStatus(overrides: Parameters<typeof requestStatusFixture>[0]): ReturnType<typeof render> {
  routeGets({ [`/api/v1/bookings/${BOOKING_ID}/request-status`]: ok(requestStatusFixture({ stage: 'reopened', ...overrides })) });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={client}><RequestStatusScreen /></QueryClientProvider>);
}

it('HA-M2-542: a reopened request says "We sent your request to more pros" only when this round reached pros', async () => {
  jest.spyOn(Date, 'now').mockReturnValue(NOW);
  const sent = renderStatus({ round: 2, notifiedProviderCount: 6 });
  expect(await screen.findByText('We sent your request to more pros')).toBeTruthy();
  expect(screen.getByText('6 local pros have been told about your request this time. We will notify you when a quote arrives.')).toBeTruthy();
  sent.unmount();

  // The third decline of three: no fan-out, the back office was asked instead.
  const view = renderStatus({ round: 4, notifiedProviderCount: 0, opsReviewAt: '2026-10-14T00:59:00.000Z', roundOpenedAt: new Date(NOW - 60_000).toISOString() });
  expect(await screen.findByText('We are looking for more pros')).toBeTruthy();
  expect(view.container.textContent).not.toContain('We sent your request to more pros');
  expect(view.container.textContent).not.toMatch(/Sent (just now|\d)/);
  expect(view.container.textContent).not.toContain('can see your request again');
});
