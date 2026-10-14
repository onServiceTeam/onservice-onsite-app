// HA-M2-180 (D38 Milestone 2, package P5b): the provider cannot send a quote
// until "What is included" (at least 10 characters, the server minimum) and
// the earliest date and time window are set, as well as a price.
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NOW, quoteScreenGets } from '../test-support/request-fixtures';
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

it('HA-M2-180: Send quote stays disabled until the price, what is included and the earliest slot are all set', async () => {
  jest.spyOn(Date, 'now').mockReturnValue(NOW);
  quoteScreenGets();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><QuoteBuilderScreen /></QueryClientProvider>);
  await screen.findByText('Aircon repair');

  // Price and slot set, nothing included yet.
  enterPrice('1800');
  chooseTomorrowMorning();
  expect(sendButton().disabled).toBe(true);
  expect(screen.getByText('To send, add what is included.')).toBeTruthy();

  // Nine characters is under the server's minimum of ten.
  enterIncluded('Clean it.');
  expect(sendButton().disabled).toBe(true);

  enterIncluded();
  expect(sendButton().disabled).toBe(false);

  // Today, as soon as possible: still a full slot.
  fireEvent.click(screen.getByRole('radio', { name: 'Today, Wed 14 Oct' }));
  fireEvent.click(screen.getByRole('radio', { name: 'As soon as possible (today only)' }));
  expect(sendButton().disabled).toBe(false);

  // Moving to tomorrow drops ASAP (today only): a date with no window is not a slot.
  fireEvent.click(screen.getByRole('radio', { name: 'Tomorrow, Thu 15 Oct' }));
  expect(sendButton().disabled).toBe(true);
  expect(screen.getByText('To send, add your earliest date and time window.')).toBeTruthy();
});
