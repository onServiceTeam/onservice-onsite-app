// HA-M2-556 (D38 Milestone 2, package P5b): on the Bookings tab, tapping an
// open request opens its request status screen (where it stands, live),
// while a booked job still opens the booking detail.
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { routeGets } from '../test-support/request-fixtures';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 390, breakpoint: 'phone', isPhone: true, isTablet: false, isDesktop: false }),
  byBreakpoint: (_breakpoint: string, values: { phone: number }) => values.phone,
}));

import BookingsScreen from '../app/(tabs)/bookings';

it('HA-M2-556: an open request opens request status, and a booked quote job opens the booking detail', async () => {
  routeGets({
    '/api/v1/bookings': { data: { success: true, meta: { page: 1, pageSize: 15, total: 2, totalPages: 1 }, data: [
      { id: 'r-1', serviceName: 'Aircon repair', status: 'quoted', requestStage: 'quote_ready', openQuoteCount: 1, bookingType: 'quote_based', totalAmount: 0, scheduledAt: '2026-10-14T05:00:00.000Z', createdAt: '2026-10-14T01:00:00.000Z' },
      { id: 'r-2', serviceName: 'Sink unclogging', status: 'paid', requestStage: 'booked', bookingType: 'quote_based', totalAmount: 198000, scheduledAt: '2026-10-15T00:00:00.000Z', createdAt: '2026-10-13T01:00:00.000Z' },
    ] } },
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><BookingsScreen /></QueryClientProvider>);

  fireEvent.click(await screen.findByRole('button', { name: 'Open Aircon repair request, Quote ready' }));
  expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/customer/booking/request-status', params: { bookingId: 'r-1' } });

  fireEvent.click(screen.getByRole('button', { name: 'Open Sink unclogging booking' }));
  expect(mockPush).toHaveBeenLastCalledWith('/customer/booking/r-2');
});
