// HA-M2-198 (D38 Milestone 2, package P5b): on the Bookings tab, a request
// shows where it stands in plain words from the server's requestStage
// ("Waiting for a pro", "Quote ready", "Looking for more pros", "Closed")
// and never a ₱0.00 price, because a request has no price until a quote is
// accepted. Ordinary bookings keep their price.
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { routeGets } from '../test-support/request-fixtures';

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 390, breakpoint: 'phone', isPhone: true, isTablet: false, isDesktop: false }),
  byBreakpoint: (_breakpoint: string, values: { phone: number }) => values.phone,
}));

import BookingsScreen from '../app/(tabs)/bookings';

const request = (id: string, serviceName: string, status: string, requestStage: string, extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  id, serviceName, status, requestStage, bookingType: 'quote_based', totalAmount: 0,
  scheduledAt: '2026-10-14T05:00:00.000Z', createdAt: '2026-10-14T01:00:00.000Z', openQuoteCount: 0, ...extra,
});

it('HA-M2-198: request cards show their stage label and no ₱0.00; a fixed-price booking keeps its price', async () => {
  routeGets({
    '/api/v1/bookings': { data: { success: true, meta: { page: 1, pageSize: 15, total: 5, totalPages: 1 }, data: [
      request('r-1', 'Aircon repair', 'requested', 'waiting'),
      request('r-2', 'Sink unclogging', 'quoted', 'quote_ready', { openQuoteCount: 1 }),
      request('r-3', 'Ceiling fan install', 'requested', 'reopened'),
      request('r-4', 'Roof leak check', 'cancelled_by_admin', 'closed'),
      { id: 'b-5', serviceName: 'Deep cleaning', status: 'matched', bookingType: 'fixed_price', totalAmount: 125000, scheduledAt: '2026-10-20T01:00:00.000Z', createdAt: '2026-10-13T01:00:00.000Z' },
    ] } },
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const { container } = render(<QueryClientProvider client={client}><BookingsScreen /></QueryClientProvider>);

  const waiting = await screen.findByRole('button', { name: 'Open Aircon repair request, Waiting for a pro' });
  expect(within(waiting).getByText('Waiting for a pro')).toBeTruthy();
  expect(within(screen.getByRole('button', { name: 'Open Sink unclogging request, Quote ready' })).getByText('Quote ready')).toBeTruthy();
  expect(within(screen.getByRole('button', { name: 'Open Ceiling fan install request, Looking for more pros' })).getByText('Looking for more pros')).toBeTruthy();
  expect(within(screen.getByRole('button', { name: 'Open Roof leak check request, Closed' })).getByText('Closed')).toBeTruthy();
  expect(container.textContent).not.toContain('₱0.00');
  expect(within(screen.getByRole('button', { name: 'Open Deep cleaning booking' })).getByText('₱1,250.00')).toBeTruthy();
});
