// HA-M2-186 (D38 Milestone 2, package P5b): after the configured minutes with
// no quote the customer sees an honest "Still looking for a pro". "Our team
// has been alerted" appears only when the back office really was asked
// (opsReviewAt set), never as a generic reassurance.
import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BOOKING_ID, ok, requestStatusFixture, routeGets } from '../test-support/request-fixtures';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({ bookingId: 'booking-req-1' }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 390, breakpoint: 'phone', isPhone: true, isTablet: false, isDesktop: false }),
}));
jest.mock('@/services/socket.service', () => require('../test-support/socket-mock').socketServiceMock);

import RequestStatusScreen from '../app/customer/booking/request-status';

const TEAM = 'Our team has been alerted and may contact you to help.';

function renderStatus(opsReviewAt: string | null): ReturnType<typeof render> {
  routeGets({
    [`/api/v1/bookings/${BOOKING_ID}/request-status`]: ok(requestStatusFixture({ stage: 'waiting', stillLooking: true, opsReviewAt })),
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={client}><RequestStatusScreen /></QueryClientProvider>);
}

it('HA-M2-186: still looking shows after the wait, and the team-alerted line only when opsReviewAt is set', async () => {
  const quiet = renderStatus(null);
  expect(await screen.findByText('Still looking for a pro')).toBeTruthy();
  expect(screen.getByText('No pro has responded yet. You can keep waiting, contact support to add details, or cancel the request.')).toBeTruthy();
  expect(screen.queryByText(TEAM)).toBeNull();
  quiet.unmount();

  renderStatus('2026-10-14T01:30:00.000Z');
  expect(await screen.findByText('Still looking for a pro')).toBeTruthy();
  expect(screen.getByText(TEAM)).toBeTruthy();
});
