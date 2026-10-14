// HA-M2-532 (D38 Milestone 2, package P5b): when the server will not let the
// provider accept the customer's budget (400 ACCEPT_BUDGET_UNAVAILABLE, for
// example a budget under the minimum quote), the provider is told to enter
// their own price, and the form switches back to the price field.
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import api from '@/services/api';
import { NOW, apiError, quoteScreenGets } from '../test-support/request-fixtures';
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

it('HA-M2-532: ACCEPT_BUDGET_UNAVAILABLE says to enter your own price and brings the price field back', async () => {
  jest.spyOn(Date, 'now').mockReturnValue(NOW);
  quoteScreenGets();
  jest.mocked(api.post).mockReset();
  jest.mocked(api.post).mockRejectedValue(apiError(400, 'ACCEPT_BUDGET_UNAVAILABLE', 'This customer has not set a budget you can accept.'));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><QuoteBuilderScreen /></QueryClientProvider>);

  fireEvent.click(await screen.findByRole('button', { name: "Use the customer's budget" }));
  enterIncluded();
  chooseTomorrowMorning();
  fireEvent.click(sendButton());

  expect(await screen.findByText('This customer has not set a budget you can accept. Enter your own price instead.')).toBeTruthy();
  expect(screen.getByLabelText('Total price in pesos')).toBeTruthy();
  expect(screen.queryByText("You are accepting the customer's budget of ₱2,500.00.")).toBeNull();
});
