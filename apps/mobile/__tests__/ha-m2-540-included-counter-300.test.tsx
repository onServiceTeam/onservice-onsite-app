// HA-M2-540 (D38 Milestone 2, package P5b): "What is included" and "Could
// change if" are capped at 300 characters (the server limit on a D38 quote),
// with a live counter, so a provider never types text the server refuses.
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { quoteScreenGets } from '../test-support/request-fixtures';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'booking-req-1' }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 390, breakpoint: 'phone', isPhone: true, isTablet: false, isDesktop: false }),
}));
jest.mock('@/services/socket.service', () => require('../test-support/socket-mock').socketServiceMock);

import QuoteBuilderScreen from '../app/provider/job/[id]/quote';

it('HA-M2-540: What is included and Could change if are capped at 300 characters with a live counter', async () => {
  quoteScreenGets();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><QuoteBuilderScreen /></QueryClientProvider>);

  const included = await screen.findByLabelText('What is included');
  const couldChange = screen.getByLabelText('Could change if');
  expect(included.getAttribute('maxlength')).toBe('300');
  expect(couldChange.getAttribute('maxlength')).toBe('300');
  expect(screen.getAllByText('0/300')).toHaveLength(2);

  fireEvent.change(included, { target: { value: 'Clean one unit.' } });
  expect(screen.getByText('15/300')).toBeTruthy();
  fireEvent.change(couldChange, { target: { value: 'Parts.' } });
  expect(screen.getByText('6/300')).toBeTruthy();
});
