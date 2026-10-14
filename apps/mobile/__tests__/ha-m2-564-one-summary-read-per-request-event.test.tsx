// HA-M2-564 (D38 Milestone 2, package P5b, review fix): with the provider
// tab bar, the dashboard and the Requests tab all on screen (the Requests
// tab badge, the dashboard card, the segment counts and the inbox all show
// the request summary), one live request event re-reads the summary once.
//
// Before the fix every mounted copy of useProviderRequestSummary added its
// own socket listeners, and each one's invalidation cancelled the read
// already running and started another: four summary GETs for one
// new:job_request and five for job_request:closed. The API allows 100
// requests per user per 15 minutes, so a busy hour could lock a pro out,
// Send quote included.
import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import api from '@/services/api';
import { REALTIME_EVENTS } from '@/config/realtime-events';
import { ok, providerRequestFixture, routeGets } from '../test-support/request-fixtures';
import { socketMock } from '../test-support/socket-mock';

jest.mock('expo-router', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ReactLocal = require('react') as typeof import('react');
  const Tabs = Object.assign(
    ({ children }: { children?: React.ReactNode }) => ReactLocal.createElement('rn-view', { 'aria-label': 'Tab navigator' }, children),
    { Screen: () => null },
  );
  return {
    Tabs,
    Redirect: () => null,
    usePathname: () => '/requests',
    useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), setParams: jest.fn() }),
    useLocalSearchParams: () => ({}),
  };
});
jest.mock('@/stores/auth.store', () => {
  const state = { isAuthenticated: true, user: { id: 'provider-user-1', role: 'provider', firstName: 'Roberto' } };
  const useAuthStore = (selector?: (s: typeof state) => unknown): unknown => (selector ? selector(state) : state);
  useAuthStore.getState = () => state;
  return { useAuthStore };
});
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 390, breakpoint: 'phone', isPhone: true, isTablet: false, isDesktop: false }),
  byBreakpoint: (_breakpoint: string, values: { phone: number }) => values.phone,
}));
jest.mock('@/components/provider/NewJobModal', () => ({ __esModule: true, default: () => null }));
jest.mock('@/components/provider/NbiStatusBanner', () => ({ __esModule: true, default: () => null }));
jest.mock('@/services/push.service', () => ({
  getPushRegistrationStatus: () => 'registered',
  onPushRegistrationStatus: () => () => undefined,
}));
jest.mock('@/services/provider-api.service', () => ({
  getMyProfile: jest.fn().mockResolvedValue({ tier: 'verified', isAvailable: true, rating: 4.5, totalJobs: 22, acceptanceRate: 0.92, services: [] }),
  setAvailability: jest.fn(),
  getProviderBookings: jest.fn().mockResolvedValue({ bookings: [] }),
}));
jest.mock('@/services/socket.service', () => require('../test-support/socket-mock').socketServiceMock);

import ProviderTabLayout from '../app/(provider-tabs)/_layout';
import ProviderDashboardScreen from '../app/(provider-tabs)/dashboard';
import ProviderRequestsTab from '../app/(provider-tabs)/requests';

const SUMMARY_URL = '/api/v1/providers/me/job-requests/summary';

function summaryReads(): number {
  return jest.mocked(api.get).mock.calls.filter((call) => call[0] === SUMMARY_URL).length;
}

async function settle(): Promise<void> {
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 50)); });
}

afterEach(() => socketMock.reset());

it('HA-M2-564: one request event re-reads the provider request summary once, however many screens show it', async () => {
  routeGets({
    [SUMMARY_URL]: ok({ openCount: 2, unseenCount: 1, quotesWaitingCount: 0, isAvailable: true }),
    '/api/v1/providers/me/job-requests': { data: { success: true, total: 1, page: 1, pageSize: 50, requests: [providerRequestFixture()] } },
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(
    <QueryClientProvider client={client}>
      <ProviderTabLayout />
      <ProviderDashboardScreen />
      <ProviderRequestsTab />
    </QueryClientProvider>,
  );
  expect(await screen.findByText('Aircon repair')).toBeTruthy();
  await waitFor(() => expect(client.getQueryState(['provider-request-summary'])?.status).toBe('success'));
  await settle();

  const beforeNew = summaryReads();
  act(() => { socketMock.serve(REALTIME_EVENTS.NEW_JOB_REQUEST, { bookingId: 'booking-req-2' }); });
  await waitFor(() => expect(summaryReads()).toBeGreaterThan(beforeNew));
  await settle();
  expect(summaryReads() - beforeNew).toBe(1);

  const beforeClosed = summaryReads();
  act(() => { socketMock.serve(REALTIME_EVENTS.JOB_REQUEST_CLOSED, { bookingId: 'booking-req-1', reason: 'taken' }); });
  await waitFor(() => expect(summaryReads()).toBeGreaterThan(beforeClosed));
  await settle();
  expect(summaryReads() - beforeClosed).toBe(1);
});
