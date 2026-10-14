// HA-M2-181 (D38 Milestone 2, package P5b): the quote request carries the D38
// fields the server's submitQuoteSchema expects: the price in centavos, "What
// is included" as description, "Could change if", the earliest date (Manila
// calendar) and time window, and one clientRequestId per form (a retry of
// the same form sends the same id, so the server never stores two quotes).
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import api from '@/services/api';
import { BOOKING_ID, NOW, apiError, quoteScreenGets } from '../test-support/request-fixtures';
import { INCLUDED_TEXT, chooseTomorrowMorning, enterIncluded, enterPrice, sendButton } from '../test-support/quote-form';

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

it('HA-M2-181: the quote body has the price in centavos, what is included, could change if, the earliest slot and a stable clientRequestId', async () => {
  jest.spyOn(Date, 'now').mockReturnValue(NOW);
  quoteScreenGets();
  // The first send fails on the network, the retry succeeds.
  jest.mocked(api.post).mockReset();
  jest.mocked(api.post)
    .mockRejectedValueOnce(apiError(503, null, 'Service unavailable'))
    .mockResolvedValueOnce({ data: { success: true, data: { id: 'quote-9' } } } as never);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><QuoteBuilderScreen /></QueryClientProvider>);
  await screen.findByText('Aircon repair');

  enterPrice('1,850.50');
  enterIncluded();
  fireEvent.change(screen.getByLabelText('Could change if'), { target: { value: 'The compressor needs replacing.' } });
  chooseTomorrowMorning();
  fireEvent.click(sendButton());
  await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(sendButton().disabled).toBe(false));
  fireEvent.click(sendButton());
  await waitFor(() => expect(api.post).toHaveBeenCalledTimes(2));

  const [url, body] = jest.mocked(api.post).mock.calls[0] as [string, Record<string, unknown>];
  expect(url).toBe(`/api/v1/bookings/${BOOKING_ID}/quotes`);
  expect(body).toEqual({
    quotedPrice: 185050,
    description: INCLUDED_TEXT,
    couldChangeIf: 'The compressor needs replacing.',
    earliestDate: '2026-10-15',
    earliestTimeWindow: 'morning',
    clientRequestId: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/),
  });
  const retryBody = jest.mocked(api.post).mock.calls[1]![1] as Record<string, unknown>;
  expect(retryBody.clientRequestId).toBe(body.clientRequestId);
});
