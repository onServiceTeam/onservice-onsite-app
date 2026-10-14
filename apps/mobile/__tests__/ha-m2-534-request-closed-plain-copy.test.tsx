// HA-M2-534 (D38 Milestone 2, package P5b): a quote sent on a request that no
// longer takes quotes gets 409 REQUEST_CLOSED. The form goes away and the
// provider is told in plain words that it can no longer take quotes, with a
// way back to the Requests tab.
//
// P5b review: the server sends REQUEST_CLOSED for any request not in
// requested or quoted, including one where the customer already accepted
// another pro (payment_pending or booked), so the copy must not say the
// customer cancelled it or that it expired.
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import api from '@/services/api';
import { NOW, apiError, quoteScreenGets } from '../test-support/request-fixtures';
import { chooseTomorrowMorning, enterIncluded, enterPrice, sendButton } from '../test-support/quote-form';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'booking-req-1' }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 390, breakpoint: 'phone', isPhone: true, isTablet: false, isDesktop: false }),
}));
jest.mock('@/services/socket.service', () => require('../test-support/socket-mock').socketServiceMock);

import QuoteBuilderScreen from '../app/provider/job/[id]/quote';

afterEach(() => jest.restoreAllMocks());

it('HA-M2-534: REQUEST_CLOSED replaces the form with plain words that do not guess why it closed', async () => {
  jest.spyOn(Date, 'now').mockReturnValue(NOW);
  quoteScreenGets();
  jest.mocked(api.post).mockReset();
  jest.mocked(api.post).mockRejectedValue(apiError(409, 'REQUEST_CLOSED', 'This request is no longer accepting quotes.'));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><QuoteBuilderScreen /></QueryClientProvider>);
  await screen.findByText('Aircon repair');

  enterPrice('1800');
  enterIncluded();
  chooseTomorrowMorning();
  fireEvent.click(sendButton());

  expect(await screen.findByText('This request is no longer taking quotes')).toBeTruthy();
  expect(screen.getByText('Another pro may have it, or the customer closed it. New requests show in your Requests tab.')).toBeTruthy();
  expect(screen.queryByText(/cancelled it or it expired/)).toBeNull();
  expect(screen.queryByRole('button', { name: 'Send quote' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Back to requests' })).toBeTruthy();
});
