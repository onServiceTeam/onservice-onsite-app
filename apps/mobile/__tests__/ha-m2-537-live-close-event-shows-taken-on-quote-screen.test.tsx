// HA-M2-537 (D38 Milestone 2, package P5b): a provider looking at a request
// when another pro's quote fills it gets job_request:closed {reason: 'taken'}
// on the live connection; the quote form goes away at once with "Another pro
// is handling this request". The same event for a different request changes
// nothing.
import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BOOKING_ID, quoteScreenGets } from '../test-support/request-fixtures';
import { socketMock } from '../test-support/socket-mock';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'booking-req-1' }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 390, breakpoint: 'phone', isPhone: true, isTablet: false, isDesktop: false }),
}));
jest.mock('@/services/socket.service', () => require('../test-support/socket-mock').socketServiceMock);

import QuoteBuilderScreen from '../app/provider/job/[id]/quote';

afterEach(() => socketMock.reset());

it('HA-M2-537: job_request:closed for this request swaps the form for the taken state; another request\'s event does not', async () => {
  quoteScreenGets();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><QuoteBuilderScreen /></QueryClientProvider>);
  expect(await screen.findByLabelText('What is included')).toBeTruthy();

  act(() => { socketMock.serve('job_request:closed', { bookingId: 'some-other-request', reason: 'taken' }); });
  expect(screen.getByLabelText('What is included')).toBeTruthy();

  act(() => { socketMock.serve('job_request:closed', { bookingId: BOOKING_ID, reason: 'taken' }); });
  expect(screen.getByText('Another pro is handling this request')).toBeTruthy();
  expect(screen.queryByLabelText('What is included')).toBeNull();
});
