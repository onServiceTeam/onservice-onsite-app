// HA-M2-196 (D38 Milestone 2, package P5b): when the wallet does not cover
// the total (the server's walletCovers is false), Confirm booking is blocked
// and the screen says honestly why: card, GCash, Maya and wallet top-ups are
// not available yet, so the wallet must already cover the total.
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import api from '@/services/api';
import { BOOKING_ID, QUOTE_ID, confirmPreviewFixture, ok, routeGets } from '../test-support/request-fixtures';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({ bookingId: 'booking-req-1', quoteId: 'quote-1' }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 390, breakpoint: 'phone', isPhone: true, isTablet: false, isDesktop: false }),
}));

import ConfirmQuoteScreen from '../app/customer/booking/confirm-quote';

it('HA-M2-196: a short wallet blocks Confirm booking and explains that only the wallet can pay for now', async () => {
  routeGets({
    [`/api/v1/bookings/${BOOKING_ID}/quotes/${QUOTE_ID}/confirm-preview`]: ok(confirmPreviewFixture({ totalAmount: 198000, walletBalance: 50000, walletCovers: false })),
  });
  jest.mocked(api.post).mockClear();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><ConfirmQuoteScreen /></QueryClientProvider>);

  expect(await screen.findByText('Your wallet does not cover the total')).toBeTruthy();
  expect(screen.getByText('This booking costs ₱1,980.00 and your wallet has ₱500.00. Card, GCash and Maya payments and wallet top-ups are not available yet, so your onService wallet must already cover the total before you can confirm.')).toBeTruthy();
  const confirm = screen.getByRole('button', { name: 'Confirm booking' }) as HTMLButtonElement;
  expect(confirm.disabled).toBe(true);
  fireEvent.click(confirm);
  expect(api.post).not.toHaveBeenCalled();
});
