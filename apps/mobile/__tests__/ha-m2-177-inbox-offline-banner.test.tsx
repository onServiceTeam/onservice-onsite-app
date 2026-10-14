// HA-M2-177 (D38 Milestone 2, package P5b): a provider switched offline is
// not sent new requests (the fan-out only notifies available pros), so the
// Requests inbox says so and how to fix it. Online providers see no banner.
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ok, routeGets } from '../test-support/request-fixtures';

let mockAvailable = false;

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 390, breakpoint: 'phone', isPhone: true, isTablet: false, isDesktop: false }),
  byBreakpoint: (_breakpoint: string, values: { phone: number }) => values.phone,
}));
jest.mock('@/stores/auth.store', () => {
  const state = { isAuthenticated: true, user: { id: 'provider-user-1', role: 'provider' } };
  const useAuthStore = (selector?: (s: typeof state) => unknown): unknown => (selector ? selector(state) : state);
  useAuthStore.getState = () => state;
  return { useAuthStore };
});
jest.mock('@/services/socket.service', () => require('../test-support/socket-mock').socketServiceMock);

import { RequestInbox } from '@/components/provider/RequestInbox';

function renderInbox(): { view: ReturnType<typeof render>; client: QueryClient } {
  routeGets({
    '/api/v1/providers/me/job-requests': { data: { success: true, total: 0, page: 1, pageSize: 50, requests: [] } },
    '/api/v1/providers/me/job-requests/summary': () => ok({ openCount: 0, unseenCount: 0, quotesWaitingCount: 0, isAvailable: mockAvailable }),
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const view = render(<QueryClientProvider client={client}><RequestInbox /></QueryClientProvider>);
  return { view, client };
}

it('HA-M2-177: an offline provider sees the offline banner on the inbox, and an online provider does not', async () => {
  mockAvailable = false;
  const offline = renderInbox();
  expect(await screen.findByText("You're offline, so customers are not sent to you. Go online on the dashboard to get new requests.")).toBeTruthy();
  offline.view.unmount();

  mockAvailable = true;
  const online = renderInbox();
  expect(await screen.findByText('No open requests right now')).toBeTruthy();
  // Only once the summary has answered "available" is the absence meaningful.
  await waitFor(() => expect(online.client.getQueryState(['provider-request-summary'])?.status).toBe('success'));
  expect(screen.queryByLabelText('You are offline')).toBeNull();
});
