// HA-M2-175 (D38 Milestone 2, package P5b): when the server says a request
// left this provider's list (job_request:closed: another pro got it, or the
// customer cancelled), its card disappears from the inbox at once, without
// waiting for the next read. Other cards stay.
import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import api from '@/services/api';
import { providerRequestFixture, routeGets } from '../test-support/request-fixtures';
import { socketMock } from '../test-support/socket-mock';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 390, breakpoint: 'phone', isPhone: true, isTablet: false, isDesktop: false }),
  byBreakpoint: (_breakpoint: string, values: { phone: number }) => values.phone,
}));
jest.mock('@/services/socket.service', () => require('../test-support/socket-mock').socketServiceMock);

import { RequestInbox } from '@/components/provider/RequestInbox';

const LIST_URL = '/api/v1/providers/me/job-requests';

afterEach(() => socketMock.reset());

it('HA-M2-175: job_request:closed removes that request card straight away and leaves the others', async () => {
  routeGets({
    [LIST_URL]: { data: { success: true, total: 2, page: 1, pageSize: 50, requests: [
      providerRequestFixture({ id: 'booking-a', serviceName: 'Aircon repair' }),
      providerRequestFixture({ id: 'booking-b', serviceName: 'Sink unclogging' }),
    ] } },
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><RequestInbox /></QueryClientProvider>);
  expect(await screen.findByText('Aircon repair')).toBeTruthy();
  expect(screen.getByText('Sink unclogging')).toBeTruthy();
  expect(screen.getByText('2 open requests in your area')).toBeTruthy();
  const reads = jest.mocked(api.get).mock.calls.filter((call) => call[0] === LIST_URL).length;

  act(() => { socketMock.serve('job_request:closed', { bookingId: 'booking-a', reason: 'taken' }); });

  await waitFor(() => expect(screen.queryByText('Aircon repair')).toBeNull());
  expect(screen.getByText('Sink unclogging')).toBeTruthy();
  expect(screen.getByText('1 open request in your area')).toBeTruthy();
  // Removed from what was already on screen: no new list read was needed.
  expect(jest.mocked(api.get).mock.calls.filter((call) => call[0] === LIST_URL).length).toBe(reads);
});
