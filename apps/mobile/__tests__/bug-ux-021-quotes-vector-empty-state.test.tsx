import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({ bookingId: 'booking-1' }),
}));
jest.mock('@/services/booking.service', () => ({
  getBookingQuotes: jest.fn().mockResolvedValue([]),
  acceptQuote: jest.fn(),
  declineQuote: jest.fn(),
}));
jest.mock('@/components/icons', () => ({
  Clock: (): React.ReactElement => <span data-testid="waiting-quotes-vector-icon" />,
  ChevronLeft: (): React.ReactElement => <span />,
  Star: (): React.ReactElement => <span />,
}));

import QuotesScreen from '../app/customer/booking/quotes';

it('Bug UX-021 — waiting-for-quotes uses the shared vector icon system instead of an emoji glyph', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><QuotesScreen /></QueryClientProvider>);

  expect(await screen.findByText('Waiting for Quotes')).toBeTruthy();
  expect(screen.queryByText('⏳')).toBeNull();
  expect(screen.getByTestId('waiting-quotes-vector-icon')).toBeTruthy();
});
