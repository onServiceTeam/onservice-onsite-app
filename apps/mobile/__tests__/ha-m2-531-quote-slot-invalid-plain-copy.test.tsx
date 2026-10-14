// HA-M2-531 (D38 Milestone 2, package P5b): when the server refuses the
// earliest slot (400 QUOTE_SLOT_INVALID, for example a window that ends too
// soon for the customer to confirm), the provider is told in plain words
// what to do, and can pick another slot and send again.
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

it('HA-M2-531: QUOTE_SLOT_INVALID shows plain guidance to choose a later window or another date', async () => {
  jest.spyOn(Date, 'now').mockReturnValue(NOW);
  quoteScreenGets();
  jest.mocked(api.post).mockReset();
  jest.mocked(api.post).mockRejectedValue(apiError(400, 'QUOTE_SLOT_INVALID', 'That time window ends too soon for the customer to confirm.'));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><QuoteBuilderScreen /></QueryClientProvider>);
  await screen.findByText('Aircon repair');

  enterPrice('1800');
  enterIncluded();
  chooseTomorrowMorning();
  fireEvent.click(sendButton());

  expect(await screen.findByText('That time can no longer be offered. The window may end too soon for the customer to confirm. Choose a later window or another date.')).toBeTruthy();
  // The form stays, so the provider can choose again.
  await waitFor(() => expect(sendButton().disabled).toBe(false));
});
