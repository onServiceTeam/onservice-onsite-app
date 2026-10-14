// HA-M2-533 (D38 Milestone 2, package P5b): "Use the customer's budget"
// sends the amount the provider saw. If the customer's budget changed in the
// meantime the server answers 400 ACCEPT_BUDGET_PRICE_MISMATCH; the provider
// is told in plain words and the request is read again so the new amount
// shows before they send again.
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import api from '@/services/api';
import { BOOKING_ID, NOW, apiError, ok, providerRequestFixture, quoteScreenGets } from '../test-support/request-fixtures';
import { chooseTomorrowMorning, enterIncluded, sendButton } from '../test-support/quote-form';

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

it('HA-M2-533: ACCEPT_BUDGET_PRICE_MISMATCH explains the budget changed and shows the new amount', async () => {
  jest.spyOn(Date, 'now').mockReturnValue(NOW);
  let budgetMax = 250000;
  quoteScreenGets(undefined, {
    [`/api/v1/providers/me/job-requests/${BOOKING_ID}`]: () => ok(providerRequestFixture({ budgetMax })),
  });
  jest.mocked(api.post).mockReset();
  jest.mocked(api.post).mockImplementation((async () => {
    budgetMax = 300000;
    throw apiError(400, 'ACCEPT_BUDGET_PRICE_MISMATCH', "When you accept the customer's budget, the price must be the top of their budget.");
  }) as never);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><QuoteBuilderScreen /></QueryClientProvider>);

  fireEvent.click(await screen.findByRole('button', { name: "Use the customer's budget" }));
  enterIncluded();
  chooseTomorrowMorning();
  fireEvent.click(sendButton());

  expect(await screen.findByText("The customer's budget has changed. Check the new amount below, then send your quote again.")).toBeTruthy();
  await waitFor(() => expect(screen.getByText("You are accepting the customer's budget of ₱3,000.00.")).toBeTruthy());
  const sent = jest.mocked(api.post).mock.calls[0]![1] as Record<string, unknown>;
  expect(sent).toMatchObject({ acceptBudget: true, quotedPrice: 250000 });
});
