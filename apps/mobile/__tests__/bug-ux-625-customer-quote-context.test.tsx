import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));
jest.mock('@/services/booking.service', () => ({
  getBookingQuotes: jest.fn(), acceptQuote: jest.fn(), declineQuote: jest.fn(),
}));

import QuotesScreen from '../app/customer/booking/quotes';

it('Bug UX-625 — quote comparison without a booking does not masquerade as a valid empty provider response', () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><QuotesScreen /></QueryClientProvider>);

  expect(screen.getByText('Quote request unavailable')).toBeTruthy();
  expect(screen.getByText('View bookings')).toBeTruthy();
  expect(screen.queryByText('Waiting for Quotes')).toBeNull();
});
