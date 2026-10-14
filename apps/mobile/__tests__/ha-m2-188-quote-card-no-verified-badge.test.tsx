// HA-M2-188 (D38 Milestone 2, package P5b): quote cards carry no "Verified"
// badge (attorney hold on trust wording, merged plan question 4), even for a
// pro with a high rating and many jobs.
import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BOOKING_ID, ok, quoteFixture, routeGets } from '../test-support/request-fixtures';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({ bookingId: 'booking-req-1' }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 390, breakpoint: 'phone', isPhone: true, isTablet: false, isDesktop: false }),
}));
jest.mock('@/services/socket.service', () => require('../test-support/socket-mock').socketServiceMock);

import QuotesScreen from '../app/customer/booking/quotes';

it('HA-M2-188: the quotes screen shows no Verified badge or verification wording on a quote card', async () => {
  routeGets({
    [`/api/v1/bookings/${BOOKING_ID}/quotes`]: ok([quoteFixture({
      provider: { ...quoteFixture().provider, ratingAverage: 5, ratingCount: 240, jobsCompleted: 610, isNew: false },
    })]),
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const { container } = render(<QueryClientProvider client={client}><QuotesScreen /></QueryClientProvider>);

  expect(await screen.findByText('Cebu Cooling')).toBeTruthy();
  expect(screen.getByText('5.0 (240 reviews)')).toBeTruthy();
  expect(container.textContent).not.toMatch(/verified/i);
  expect(container.innerHTML).not.toMatch(/verified/i);
});
