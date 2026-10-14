import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({ bookingId: 'booking-1' }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 920, breakpoint: 'tablet', isPhone: false, isTablet: true, isDesktop: false }),
}));
// D38 Milestone 2 (P5b): quotes are read through request.service, in the D38
// shape (provider block, budget comparison, slot). Compare mode is when the
// admin setting allows more than one open quote per request.
jest.mock('@/services/request.service', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fixtures = require('../test-support/request-fixtures') as typeof import('../test-support/request-fixtures');
  return {
    ...jest.requireActual('@/services/request.service'),
    getBookingQuotes: jest.fn().mockResolvedValue([
      fixtures.quoteFixture({ id: 'quote-1', bookingId: 'booking-1', provider: { ...fixtures.quoteFixture().provider, id: 'provider-1', name: 'Cebu Prime' } }),
      fixtures.quoteFixture({ id: 'quote-2', bookingId: 'booking-1', quotedPrice: 135000, provider: { ...fixtures.quoteFixture().provider, id: 'provider-2', name: 'Mandaue Air Care' } }),
    ]),
    declineQuote: jest.fn(),
  };
});

import QuotesScreen from '../app/customer/booking/quotes';

it('Bug UX-020 — quote comparison becomes a two-column grid on tablet and desktop widths', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><QuotesScreen /></QueryClientProvider>);

  const grid = await screen.findByLabelText('Quote comparison grid');
  expect(screen.queryByLabelText('Quote list')).toBeNull();
  expect(grid.children).toHaveLength(2);
  expect(screen.getByText('Cebu Prime')).toBeTruthy();
  expect(screen.getByText('Mandaue Air Care')).toBeTruthy();
});
