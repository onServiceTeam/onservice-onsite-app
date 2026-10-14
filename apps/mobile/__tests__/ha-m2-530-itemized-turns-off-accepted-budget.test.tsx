// HA-M2-530 (D38 Milestone 2, package P5b): the server refuses a quote that
// both accepts the customer's budget and sends line items. So turning on
// "Add an itemized breakdown" switches back from the accepted budget, and the
// quote that goes out has line items and no acceptBudget.
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import api from '@/services/api';
import { NOW, quoteScreenGets } from '../test-support/request-fixtures';
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

it('HA-M2-530: turning on the itemized breakdown drops "Use the customer\'s budget", so the quote is not sent with both', async () => {
  jest.spyOn(Date, 'now').mockReturnValue(NOW);
  quoteScreenGets();
  jest.mocked(api.post).mockReset();
  jest.mocked(api.post).mockResolvedValue({ data: { success: true, data: { id: 'quote-9' } } } as never);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><QuoteBuilderScreen /></QueryClientProvider>);

  fireEvent.click(await screen.findByRole('button', { name: "Use the customer's budget" }));
  expect(screen.getByText("You are accepting the customer's budget of ₱2,500.00.")).toBeTruthy();

  fireEvent.click(screen.getByRole('switch', { name: 'Add an itemized breakdown' }));
  expect(screen.queryByText("You are accepting the customer's budget of ₱2,500.00.")).toBeNull();
  // The budget button is not offered while itemizing.
  expect(screen.queryByRole('button', { name: "Use the customer's budget" })).toBeNull();

  fireEvent.change(screen.getByPlaceholderText('Item description'), { target: { value: 'Labor' } });
  fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '2000' } });
  enterIncluded();
  chooseTomorrowMorning();
  fireEvent.click(sendButton());

  await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
  const body = jest.mocked(api.post).mock.calls[0]![1] as Record<string, unknown>;
  expect(body.acceptBudget).toBeUndefined();
  expect(body.quotedPrice).toBe(200000);
  expect(body.lineItems).toEqual([{ description: 'Labor', quantity: 1, unit: 'unit', unitPrice: 200000, itemType: 'labor' }]);
});
