// Bug R-PRV-02 (repair batch 1a): the provider's "send a quote" half had no
// render test. HA-M2-181 checks what the POST carries (the lead id and the
// price in centavos); this test checks what happens after the server accepts
// the quote. Once the quote is in, both provider lists must re-read: the
// quoted request leaves New requests (the server drops a lead this pro has
// quoted) and the new quote shows in My quotes. quote.tsx does this with
// refreshRequestLists() in the send's success path.
//
// The Requests tab (app/(provider-tabs)/requests.tsx) shows one of these two
// lists at a time. This test renders both so each refresh can be checked. In
// the app the list that is open re-reads straight away, and the other one
// re-reads when it is next opened.
//
// The live connection is up, as it is normally, so the lists do not poll:
// only the screen's own refresh can bring them up to date.
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import api from '@/services/api';
import {
  BOOKING_ID,
  NOW,
  QUOTE_ID,
  myQuoteFixture,
  ok,
  providerRequestFixture,
  quoteFixture,
  quoteScreenGets,
  routePosts,
} from '../test-support/request-fixtures';
import { chooseTomorrowMorning, enterIncluded, enterPrice, sendButton } from '../test-support/quote-form';
import { socketMock } from '../test-support/socket-mock';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'booking-req-1' }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 390, breakpoint: 'phone', isPhone: true, isTablet: false, isDesktop: false }),
  byBreakpoint: (_breakpoint: string, values: { phone: number }) => values.phone,
}));
jest.mock('@/services/socket.service', () => require('../test-support/socket-mock').socketServiceMock);

import QuoteBuilderScreen from '../app/provider/job/[id]/quote';
import { MyQuotesList, RequestInbox } from '@/components/provider/RequestInbox';

const LIST_URL = '/api/v1/providers/me/job-requests';
const MY_QUOTES_URL = '/api/v1/providers/me/quotes';
const INBOX_CARD = 'Open Aircon repair job request and prepare a quote';
const MY_QUOTE_CARD = 'Aircon repair, Waiting for the customer';

afterEach(() => {
  socketMock.reset();
  jest.restoreAllMocks();
});

it('Bug R-PRV-02 — after Send quote succeeds, the Requests list drops the quoted request and My quotes shows the new quote', async () => {
  jest.spyOn(Date, 'now').mockReturnValue(NOW);
  socketMock.setConnected(true);

  // What the server answers before and after it stores the quote.
  let quoteStored = false;
  const ownQuote = { id: QUOTE_ID, status: 'submitted', quotedPrice: 180000, earliestDate: '2026-10-15', earliestTimeWindow: 'morning' as const };
  quoteScreenGets(providerRequestFixture(), {
    [`/api/v1/providers/me/job-requests/${BOOKING_ID}`]: () => ok(providerRequestFixture({ myQuote: quoteStored ? ownQuote : null })),
    [LIST_URL]: () => ({
      data: {
        success: true,
        total: quoteStored ? 0 : 1,
        page: 1,
        pageSize: 50,
        requests: quoteStored ? [] : [providerRequestFixture()],
      },
    }),
    [MY_QUOTES_URL]: () => (quoteStored
      ? ok([myQuoteFixture({ displayStatus: 'waiting' })], { meta: { page: 1, pageSize: 50, total: 1 } })
      : ok([], { meta: { page: 1, pageSize: 50, total: 0 } })),
    [`/api/v1/bookings/${BOOKING_ID}/quotes`]: ok([quoteFixture()]),
  });
  jest.mocked(api.post).mockReset();
  routePosts({
    [`/api/v1/bookings/${BOOKING_ID}/quotes`]: () => {
      quoteStored = true;
      return ok({ id: QUOTE_ID, status: 'submitted' });
    },
  });

  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <RequestInbox />
      <MyQuotesList />
      <QuoteBuilderScreen />
    </QueryClientProvider>,
  );

  // Before sending: the request is in New requests and My quotes is empty.
  expect(await screen.findByRole('button', { name: INBOX_CARD })).toBeTruthy();
  expect(await screen.findByText('No quotes yet')).toBeTruthy();
  expect(screen.queryByRole('button', { name: MY_QUOTE_CARD })).toBeNull();

  enterPrice('1800');
  enterIncluded();
  chooseTomorrowMorning();
  fireEvent.click(sendButton());
  await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));

  // After the server accepts the quote, both lists are re-read.
  await waitFor(() => expect(screen.queryByRole('button', { name: INBOX_CARD })).toBeNull());
  expect(screen.getByText('No open requests right now')).toBeTruthy();
  expect(await screen.findByRole('button', { name: MY_QUOTE_CARD })).toBeTruthy();
  expect(screen.queryByText('No quotes yet')).toBeNull();
});
