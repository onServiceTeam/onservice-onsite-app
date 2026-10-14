// HA-M2-561 (D38 Milestone 2, package P5b): with the default of one open
// quote per request, the quotes screen shows the single quote as "Your
// quote" (not a comparison), with the pro's price large, what is included,
// what could change it, the earliest slot in plain words and how fast the
// pro responded. A quote the customer declined earlier sits under "Earlier
// quotes" with no buttons.
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BOOKING_ID, NOW, ok, quoteFixture, routeGets } from '../test-support/request-fixtures';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({ bookingId: 'booking-req-1' }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 390, breakpoint: 'phone', isPhone: true, isTablet: false, isDesktop: false }),
}));
jest.mock('@/services/socket.service', () => require('../test-support/socket-mock').socketServiceMock);

import QuotesScreen from '../app/customer/booking/quotes';

afterEach(() => jest.restoreAllMocks());

it('HA-M2-561: one open quote shows as "Your quote" with its details, and an earlier declined quote has no actions', async () => {
  jest.spyOn(Date, 'now').mockReturnValue(NOW);
  routeGets({
    [`/api/v1/bookings/${BOOKING_ID}/quotes`]: ok([
      quoteFixture({ id: 'quote-old', status: 'declined', declineReason: 'too_expensive', quotedPrice: 320000, provider: { ...quoteFixture().provider, id: 'provider-0', name: 'Talisay Aircon' } }),
      quoteFixture(),
    ]),
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><QuotesScreen /></QueryClientProvider>);

  expect(await screen.findByText('Your quote')).toBeTruthy();
  const live = screen.getByLabelText('Quote from Cebu Cooling for ₱1,800.00');
  expect(within(live).getByText('₱1,800.00')).toBeTruthy();
  expect(within(live).getByText('Clean and check one split-type aircon, including the drain line.')).toBeTruthy();
  expect(within(live).getByText('The compressor needs replacing.')).toBeTruthy();
  expect(within(live).getByText('Tomorrow, morning (8 AM to 12 PM)')).toBeTruthy();
  expect(within(live).getByText('Responded in 12 min')).toBeTruthy();
  expect(within(live).getByRole('button', { name: 'Accept and book Cebu Cooling' })).toBeTruthy();

  expect(screen.getByText('Earlier quotes')).toBeTruthy();
  const earlier = screen.getByLabelText('Quote from Talisay Aircon for ₱3,200.00');
  expect(within(earlier).getByText('Declined')).toBeTruthy();
  expect(within(earlier).queryByRole('button')).toBeNull();
});
