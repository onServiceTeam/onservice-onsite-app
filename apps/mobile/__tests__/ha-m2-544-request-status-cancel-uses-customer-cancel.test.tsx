// HA-M2-544 (D38 Milestone 2, package P5b): Cancel request on the status
// screen asks first (a real dialog that works on the web app), then uses the
// existing customer cancel path (PATCH /bookings/:id/status
// cancelled_by_customer).
import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import api from '@/services/api';
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

it('HA-M2-544: Cancel request confirms first, then sends the customer cancel status change', async () => {
  routeGets({
    [`/api/v1/bookings/${BOOKING_ID}/request-status`]: ok(requestStatusFixture({ stage: 'waiting' })),
  });
  jest.mocked(api.patch).mockClear();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><RequestStatusScreen /></QueryClientProvider>);

  fireEvent.click(await screen.findByRole('button', { name: 'Cancel request' }));
  const dialog = screen.getByRole('alert');
  expect(dialog.textContent).toContain('Cancel this request?');
  expect(dialog.textContent).toContain('nothing has been charged');
  expect(api.patch).not.toHaveBeenCalled();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel request' }));

  await waitFor(() => expect(api.patch).toHaveBeenCalledWith(
    `/api/v1/bookings/${BOOKING_ID}/status`,
    { status: 'cancelled_by_customer' },
  ));
});
