import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));
// D38 Milestone 2 (P5b): the quotes screen reads quotes through
// request.service (it no longer imports booking.service), and the empty
// state's title is now "No quotes yet" (was "Waiting for Quotes"), so the
// guard below checks the current title and can fail again.
jest.mock('@/services/request.service', () => ({
  ...jest.requireActual('@/services/request.service'),
  getBookingQuotes: jest.fn().mockResolvedValue([]),
  declineQuote: jest.fn(),
}));

import QuotesScreen from '../app/customer/booking/quotes';

it('Bug UX-625 — quote comparison without a booking does not masquerade as a valid empty provider response', () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><QuotesScreen /></QueryClientProvider>);

  expect(screen.getByText('Quote request unavailable')).toBeTruthy();
  expect(screen.getByText('View bookings')).toBeTruthy();
  expect(screen.queryByText('No quotes yet')).toBeNull();
});
