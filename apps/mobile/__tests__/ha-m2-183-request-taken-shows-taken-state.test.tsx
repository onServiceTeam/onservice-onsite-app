// HA-M2-183 (D38 Milestone 2, package P5b): with one open quote per request,
// a provider who sends a quote after another pro got there first gets 409
// REQUEST_TAKEN. The form goes away and the screen says "Another pro is
// handling this request", with a way back to the Requests tab.
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import api from '@/services/api';
import { NOW, apiError, quoteScreenGets } from '../test-support/request-fixtures';
import { chooseTomorrowMorning, enterIncluded, enterPrice, sendButton } from '../test-support/quote-form';

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: mockReplace }),
  useLocalSearchParams: () => ({ id: 'booking-req-1' }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 390, breakpoint: 'phone', isPhone: true, isTablet: false, isDesktop: false }),
}));
jest.mock('@/services/socket.service', () => require('../test-support/socket-mock').socketServiceMock);

import QuoteBuilderScreen from '../app/provider/job/[id]/quote';

afterEach(() => jest.restoreAllMocks());

it('HA-M2-183: a 409 REQUEST_TAKEN replaces the form with "Another pro is handling this request" and a way back', async () => {
  jest.spyOn(Date, 'now').mockReturnValue(NOW);
  quoteScreenGets();
  jest.mocked(api.post).mockReset();
  jest.mocked(api.post).mockRejectedValue(apiError(409, 'REQUEST_TAKEN', 'Another pro already responded to this request.'));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><QuoteBuilderScreen /></QueryClientProvider>);
  await screen.findByText('Aircon repair');

  enterPrice('1800');
  enterIncluded();
  chooseTomorrowMorning();
  fireEvent.click(sendButton());

  expect(await screen.findByText('Another pro is handling this request')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Send quote' })).toBeNull();
  expect(screen.queryByLabelText('What is included')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Back to requests' }));
  expect(mockReplace).toHaveBeenCalledWith('/(provider-tabs)/requests');
  await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
});
