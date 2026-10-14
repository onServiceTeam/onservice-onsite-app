// HA-M2-194 (D38 Milestone 2, package P5b): Confirm booking shows what the
// server's confirm preview says: the pro, the proposed date and window, the
// address, what is included, the pro's price, any suki discount, the service
// fee, the total and the wallet balance. The app computes no amount.
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BOOKING_ID, NOW, QUOTE_ID, confirmPreviewFixture, ok, routeGets } from '../test-support/request-fixtures';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({ bookingId: 'booking-req-1', quoteId: 'quote-1' }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 390, breakpoint: 'phone', isPhone: true, isTablet: false, isDesktop: false }),
}));

import ConfirmQuoteScreen from '../app/customer/booking/confirm-quote';

afterEach(() => jest.restoreAllMocks());

it('HA-M2-194: the confirm screen renders the preview: pro, time, address, included, price, suki discount, fee, total and wallet', async () => {
  jest.spyOn(Date, 'now').mockReturnValue(NOW);
  routeGets({
    [`/api/v1/bookings/${BOOKING_ID}/quotes/${QUOTE_ID}/confirm-preview`]: ok(confirmPreviewFixture({
      quotedPrice: 180000, sukiDiscount: 9000, servicePrice: 171000, serviceFee: 17100, totalAmount: 188100, walletBalance: 500000,
    })),
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><ConfirmQuoteScreen /></QueryClientProvider>);

  expect(await screen.findByText('Cebu Cooling')).toBeTruthy();
  expect(screen.getByText('4.8 (12 reviews)')).toBeTruthy();
  const when = screen.getByLabelText('When');
  expect(within(when).getByText('Tomorrow, morning (8 AM to 12 PM)')).toBeTruthy();
  expect(within(when).getByText('88 Banilad Road, Banilad, Cebu City')).toBeTruthy();
  expect(screen.getByText('Clean and check one split-type aircon, including the drain line.')).toBeTruthy();
  expect(screen.getByText('The compressor needs replacing.')).toBeTruthy();
  const price = screen.getByLabelText('Price');
  expect(within(price).getByText('₱1,800.00')).toBeTruthy();
  expect(within(price).getByText('-₱90.00')).toBeTruthy();
  expect(within(price).getByText('₱171.00')).toBeTruthy();
  expect(within(price).getByText('₱1,881.00')).toBeTruthy();
  expect(within(price).getByText('₱5,000.00')).toBeTruthy();
  expect((screen.getByRole('button', { name: 'Confirm booking' }) as HTMLButtonElement).disabled).toBe(false);
});
