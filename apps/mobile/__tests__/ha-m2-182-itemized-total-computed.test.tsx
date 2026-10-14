// HA-M2-182 (D38 Milestone 2, package P5b): with "Add an itemized breakdown"
// on, the quote total shown is the sum of the line items, and the quote is
// sent with those line items (the server recomputes the stored total from
// them; the shown total is only a preview).
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

it('HA-M2-182: the itemized breakdown total is the sum of quantity times unit price, and the quote carries the line items', async () => {
  jest.spyOn(Date, 'now').mockReturnValue(NOW);
  quoteScreenGets();
  jest.mocked(api.post).mockReset();
  jest.mocked(api.post).mockResolvedValue({ data: { success: true, data: { id: 'quote-9' } } } as never);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><QuoteBuilderScreen /></QueryClientProvider>);
  await screen.findByText('Aircon repair');

  fireEvent.click(screen.getByRole('switch', { name: 'Add an itemized breakdown' }));
  // The own-price field gives way to the line items.
  expect(screen.queryByLabelText('Total price in pesos')).toBeNull();
  fireEvent.change(screen.getByPlaceholderText('Item description'), { target: { value: 'Labor' } });
  fireEvent.change(screen.getByPlaceholderText('0.00'), { target: { value: '800' } });
  fireEvent.click(screen.getByText('+ Add Item'));
  const descriptions = screen.getAllByPlaceholderText('Item description');
  const prices = screen.getAllByPlaceholderText('0.00');
  const quantities = screen.getAllByDisplayValue('1');
  fireEvent.change(descriptions[1]!, { target: { value: 'Refrigerant' } });
  fireEvent.change(quantities[1]!, { target: { value: '2' } });
  fireEvent.change(prices[1]!, { target: { value: '350.25' } });

  // 800.00 + 2 x 350.25 = 1,500.50
  expect(screen.getByText('₱1,500.50')).toBeTruthy();

  enterIncluded();
  chooseTomorrowMorning();
  fireEvent.click(sendButton());
  await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
  const body = jest.mocked(api.post).mock.calls[0]![1] as Record<string, unknown>;
  expect(body.quotedPrice).toBe(150050);
  expect(body.lineItems).toEqual([
    { description: 'Labor', quantity: 1, unit: 'unit', unitPrice: 80000, itemType: 'labor' },
    { description: 'Refrigerant', quantity: 2, unit: 'unit', unitPrice: 35025, itemType: 'labor' },
  ]);
  expect(body.acceptBudget).toBeUndefined();
});
