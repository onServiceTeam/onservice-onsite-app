// HA-M2-184 (D38 Milestone 2, package P5b): My quotes shows what became of
// each quote this provider sent, in plain words, from the server's
// displayStatus (GET /providers/me/quotes).
import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import api from '@/services/api';
import { myQuoteFixture, ok, routeGets } from '../test-support/request-fixtures';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 390, breakpoint: 'phone', isPhone: true, isTablet: false, isDesktop: false }),
  byBreakpoint: (_breakpoint: string, values: { phone: number }) => values.phone,
}));
jest.mock('@/services/socket.service', () => require('../test-support/socket-mock').socketServiceMock);

import { MyQuotesList } from '@/components/provider/RequestInbox';

it('HA-M2-184: My quotes labels each quote waiting, accepted, booked, declined, not selected, expired, withdrawn or request closed', async () => {
  const statuses = ['waiting', 'accepted', 'booked', 'declined', 'not_selected', 'expired', 'withdrawn', 'request_closed'] as const;
  routeGets({
    '/api/v1/providers/me/quotes': ok(
      statuses.map((displayStatus, index) => myQuoteFixture({
        quoteId: `quote-${index}`,
        bookingId: `booking-${index}`,
        serviceName: `Job ${index + 1}`,
        displayStatus,
        declineReason: displayStatus === 'declined' ? 'timing' : null,
      })),
      { meta: { page: 1, pageSize: 50, total: statuses.length } },
    ),
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><MyQuotesList /></QueryClientProvider>);

  expect(await screen.findByRole('button', { name: 'Job 1, Waiting for the customer' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Job 2, Accepted, waiting for payment' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Job 3, Booked' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Job 4, Declined by the customer' })).toBeTruthy();
  expect(screen.getByText('Reason: Timing did not work')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Job 5, Customer chose another pro' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Job 6, Expired' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Job 7, Withdrawn' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Job 8, Request closed' })).toBeTruthy();
  const [, init] = jest.mocked(api.get).mock.calls.find((call) => call[0] === '/api/v1/providers/me/quotes')!;
  expect((init as { params: Record<string, unknown> }).params).toEqual({ status: 'all', page: 1, pageSize: 50 });
});
