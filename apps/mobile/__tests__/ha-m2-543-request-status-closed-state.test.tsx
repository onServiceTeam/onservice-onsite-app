// HA-M2-543 (D38 Milestone 2, package P5b): a closed request (cancelled, or
// expired with no pro) says so plainly, offers to book again, and no longer
// offers to cancel.
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BOOKING_ID, ok, requestStatusFixture, routeGets } from '../test-support/request-fixtures';

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: mockReplace }),
  useLocalSearchParams: () => ({ bookingId: 'booking-req-1' }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 390, breakpoint: 'phone', isPhone: true, isTablet: false, isDesktop: false }),
}));
jest.mock('@/services/socket.service', () => require('../test-support/socket-mock').socketServiceMock);

import RequestStatusScreen from '../app/customer/booking/request-status';

it('HA-M2-543: an expired request reads "This request is closed", offers Book a service, and has no Cancel', async () => {
  routeGets({
    [`/api/v1/bookings/${BOOKING_ID}/request-status`]: ok(requestStatusFixture({ status: 'cancelled_by_admin', stage: 'closed', notifiedProviderCount: 0 })),
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><RequestStatusScreen /></QueryClientProvider>);

  expect(await screen.findByText('This request is closed')).toBeTruthy();
  expect(screen.getByText('It was cancelled, or no pro took it in time. You can post a new request at any time.')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Cancel request' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Book a service' }));
  expect(mockReplace).toHaveBeenCalledWith('/(tabs)/home');
});
