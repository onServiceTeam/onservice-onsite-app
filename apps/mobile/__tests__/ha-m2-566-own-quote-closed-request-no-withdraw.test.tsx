// HA-M2-566 (D38 Milestone 2, package P5b, review fix): a pro quoted, then
// the customer cancelled the request. A cancel leaves the quote row as
// 'submitted' until the expiry worker runs, so the request screen's raw
// status still said "Waiting for the customer" and offered Withdraw, which
// the server then refused with 409, while My quotes (the server's
// displayStatus) said "Request closed". The read-only quote card now uses
// the same display status as My quotes, and offers Withdraw only while the
// server says the quote is waiting.
import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  BOOKING_ID,
  QUOTE_ID,
  myQuoteFixture,
  ok,
  providerRequestFixture,
  quoteFixture,
  quoteScreenGets,
} from '../test-support/request-fixtures';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'booking-req-1' }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 390, breakpoint: 'phone', isPhone: true, isTablet: false, isDesktop: false }),
}));
jest.mock('@/services/socket.service', () => require('../test-support/socket-mock').socketServiceMock);

import QuoteBuilderScreen from '../app/provider/job/[id]/quote';

it('HA-M2-566: a quote on a cancelled request shows "Request closed" and no Withdraw, as My quotes does', async () => {
  quoteScreenGets(providerRequestFixture({
    // The quote row is still 'submitted' after the customer cancelled.
    myQuote: { id: QUOTE_ID, status: 'submitted', quotedPrice: 180000, earliestDate: '2026-10-15', earliestTimeWindow: 'morning' },
  }), {
    [`/api/v1/bookings/${BOOKING_ID}/quotes`]: ok([quoteFixture()]),
    '/api/v1/providers/me/quotes': ok([myQuoteFixture({ displayStatus: 'request_closed' })], { meta: { page: 1, pageSize: 50, total: 1 } }),
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><QuoteBuilderScreen /></QueryClientProvider>);

  const card = await screen.findByLabelText('Your quote');
  await waitFor(() => expect(within(card).getByText('Request closed')).toBeTruthy());
  expect(within(card).queryByText('Waiting for the customer')).toBeNull();
  expect(within(card).queryByRole('button', { name: 'Withdraw quote' })).toBeNull();
});
