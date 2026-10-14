import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({ bookingId: 'booking-1' }),
}));
// D38 Milestone 2 (P5b): quotes are read through request.service.
jest.mock('@/services/request.service', () => ({
  ...jest.requireActual('@/services/request.service'),
  getBookingQuotes: jest.fn().mockResolvedValue([]),
  declineQuote: jest.fn(),
}));
jest.mock('@/components/icons', () => ({
  Clock: (): React.ReactElement => <span data-testid="waiting-quotes-vector-icon" />,
  ChevronLeft: (): React.ReactElement => <span />,
  Star: (): React.ReactElement => <span />,
}));

import QuotesScreen from '../app/customer/booking/quotes';

// D38 Milestone 2 (P5b): the empty state's title is now "No quotes yet" (was
// "Waiting for Quotes"); the icon rule this test pins is unchanged.
it('Bug UX-021 — waiting-for-quotes uses the shared vector icon system instead of an emoji glyph', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><QuotesScreen /></QueryClientProvider>);

  expect(await screen.findByText('No quotes yet')).toBeTruthy();
  expect(screen.queryByText('⏳')).toBeNull();
  expect(screen.getByTestId('waiting-quotes-vector-icon')).toBeTruthy();
});
