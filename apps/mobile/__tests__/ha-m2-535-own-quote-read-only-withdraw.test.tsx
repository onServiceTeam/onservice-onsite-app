// HA-M2-535 (D38 Milestone 2, package P5b): after quoting, the request screen
// shows the provider's own quote read-only (no form), and a live quote can be
// withdrawn after a confirm step (POST .../quotes/:quoteId/withdraw), which
// works on the web app too (no Alert.alert).
//
// P5b review: the quote's status now comes from My quotes (the server's
// display status), so the fixture includes that list; Withdraw shows while
// it says "waiting" (HA-M2-566 covers a closed request).
import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Alert } from 'react-native';
import api from '@/services/api';
import { BOOKING_ID, QUOTE_ID, myQuoteFixture, ok, providerRequestFixture, quoteFixture, quoteScreenGets } from '../test-support/request-fixtures';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'booking-req-1' }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 390, breakpoint: 'phone', isPhone: true, isTablet: false, isDesktop: false }),
}));
jest.mock('@/services/socket.service', () => require('../test-support/socket-mock').socketServiceMock);

import QuoteBuilderScreen from '../app/provider/job/[id]/quote';

it('HA-M2-535: a quoted request shows the read-only quote, and Withdraw (after confirming) calls the withdraw endpoint', async () => {
  quoteScreenGets(providerRequestFixture({
    myQuote: { id: QUOTE_ID, status: 'submitted', quotedPrice: 180000, earliestDate: '2026-10-15', earliestTimeWindow: 'morning' },
  }), {
    [`/api/v1/bookings/${BOOKING_ID}/quotes`]: ok([quoteFixture()]),
    '/api/v1/providers/me/quotes': ok([myQuoteFixture({ displayStatus: 'waiting' })], { meta: { page: 1, pageSize: 50, total: 1 } }),
  });
  jest.mocked(api.post).mockReset();
  jest.mocked(api.post).mockResolvedValue({ data: { success: true, data: { quoteId: QUOTE_ID, bookingStatus: 'requested', round: 2, reopened: true } } } as never);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><QuoteBuilderScreen /></QueryClientProvider>);

  const card = await screen.findByLabelText('Your quote');
  expect(within(card).getByText('₱1,800.00')).toBeTruthy();
  expect(await within(card).findByText('Waiting for the customer')).toBeTruthy();
  expect(await within(card).findByText('Clean and check one split-type aircon, including the drain line.')).toBeTruthy();
  expect(within(card).getByText('The compressor needs replacing.')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Send quote' })).toBeNull();
  expect(screen.queryByLabelText('What is included')).toBeNull();

  fireEvent.click(await within(card).findByRole('button', { name: 'Withdraw quote' }));
  const dialog = screen.getByRole('alert');
  expect(dialog.textContent).toContain('Withdraw your quote?');
  expect(api.post).not.toHaveBeenCalled();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Withdraw quote' }));

  await waitFor(() => expect(api.post).toHaveBeenCalledWith(`/api/v1/bookings/${BOOKING_ID}/quotes/${QUOTE_ID}/withdraw`, {}));
  expect(Alert.alert).not.toHaveBeenCalled();
});
