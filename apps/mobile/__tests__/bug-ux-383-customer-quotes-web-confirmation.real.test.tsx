import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Alert } from 'react-native';
import { acceptQuote } from '@/services/request.service';

const mockPush = jest.fn();
const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), push: mockPush, replace: mockReplace }),
  useLocalSearchParams: () => ({ bookingId: 'booking-quote' }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1280, breakpoint: 'desktop', isPhone: false, isTablet: false, isDesktop: true }),
}));
jest.mock('@/services/request.service', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fixtures = require('../test-support/request-fixtures') as typeof import('../test-support/request-fixtures');
  return {
    ...jest.requireActual('@/services/request.service'),
    getBookingQuotes: jest.fn().mockResolvedValue([fixtures.quoteFixture({ id: 'quote-1', bookingId: 'booking-quote' })]),
    acceptQuote: jest.fn(),
    declineQuote: jest.fn(),
  };
});

import QuotesScreen from '../app/customer/booking/quotes';

// D38 Milestone 2 (P5b): accepting no longer happens on the quotes screen.
// "Accept and book" moves to the registered Confirm booking route (where the
// total is shown and the accept call and payment route live), without a
// browser alert, which does nothing useful on the web app.
it('Bug UX-383 — desktop quote acceptance continues to the registered confirm route without a browser alert', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><QuotesScreen /></QueryClientProvider>);

  fireEvent.click(await screen.findByRole('button', { name: 'Accept and book Cebu Cooling' }));

  expect(mockPush).toHaveBeenCalledWith({
    pathname: '/customer/booking/confirm-quote',
    params: { bookingId: 'booking-quote', quoteId: 'quote-1' },
  });
  expect(Alert.alert).not.toHaveBeenCalled();
  expect(acceptQuote).not.toHaveBeenCalled();
});
