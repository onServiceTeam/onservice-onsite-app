// HA-M2-568 (D38 Milestone 2, package P5b, review fix): opening a request
// marks it viewed on the server (GET /providers/me/job-requests/:id). The
// app now re-reads the request summary straight away, so the Requests tab
// badge and the "New requests (N)" count drop, and the inbox card loses its
// "New" badge, instead of still counting the request as unseen for up to
// two minutes.
import React from 'react';
import { Text } from 'react-native';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  BOOKING_ID,
  ok,
  providerRequestFixture,
  quoteScreenGets,
} from '../test-support/request-fixtures';
import { useProviderRequestSummary } from '@/hooks/useProviderRequestSummary';
import { PROVIDER_LEADS_KEY } from '@/components/provider/RequestInbox';
import type { ProviderJobRequestPage } from '@/services/request.service';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'booking-req-1' }),
}));
jest.mock('@/stores/auth.store', () => {
  const state = { isAuthenticated: true, user: { id: 'provider-user-1', role: 'provider', firstName: 'Roberto' } };
  const useAuthStore = (selector?: (s: typeof state) => unknown): unknown => (selector ? selector(state) : state);
  useAuthStore.getState = () => state;
  return { useAuthStore };
});
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 390, breakpoint: 'phone', isPhone: true, isTablet: false, isDesktop: false }),
}));
jest.mock('@/services/socket.service', () => require('../test-support/socket-mock').socketServiceMock);

import QuoteBuilderScreen from '../app/provider/job/[id]/quote';

/** Stands in for the tab badge underneath the stacked request screen. */
function UnseenBadge(): React.ReactElement {
  const { summary } = useProviderRequestSummary();
  return <Text>{`Unseen requests: ${summary.unseenCount}`}</Text>;
}

it('HA-M2-568: opening an unseen request re-reads the unseen count and clears the card\'s New badge', async () => {
  let opened = false;
  quoteScreenGets(undefined, {
    [`/api/v1/providers/me/job-requests/${BOOKING_ID}`]: () => { opened = true; return ok(providerRequestFixture({ viewedAt: null })); },
    '/api/v1/providers/me/job-requests/summary': () => ok({ openCount: 1, unseenCount: opened ? 0 : 1, quotesWaitingCount: 0, isAvailable: true }),
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 60_000 } } });
  // The inbox list and the counts as they were before the pro opened the request.
  client.setQueryData<ProviderJobRequestPage>(PROVIDER_LEADS_KEY, {
    requests: [providerRequestFixture({ viewedAt: null })], total: 1, page: 1, pageSize: 50,
  });
  client.setQueryData(['provider-request-summary'], { openCount: 1, unseenCount: 1, quotesWaitingCount: 0, isAvailable: true });
  render(
    <QueryClientProvider client={client}>
      <UnseenBadge />
      <QuoteBuilderScreen />
    </QueryClientProvider>,
  );
  expect(screen.getByText('Unseen requests: 1')).toBeTruthy();

  expect(await screen.findByText('Aircon repair')).toBeTruthy();
  expect(await screen.findByText('Unseen requests: 0')).toBeTruthy();
  const card = client.getQueryData<ProviderJobRequestPage>(PROVIDER_LEADS_KEY)?.requests[0];
  expect(card?.viewedAt).not.toBeNull();
});
