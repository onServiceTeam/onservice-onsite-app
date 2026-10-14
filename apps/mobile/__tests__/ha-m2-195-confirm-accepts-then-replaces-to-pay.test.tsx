// HA-M2-195 (D38 Milestone 2, package P5b): Confirm booking accepts the quote
// (POST .../accept) and then replaces the screen with the existing pay
// screen for the booking. The message on the way says the booking is not
// confirmed until it is paid (P5b review: it used to say "Booking
// confirmed", contradicting "Pay to confirm" on the other screens).
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import api from '@/services/api';
import { useToastStore } from '@/components/ui';
import { BOOKING_ID, QUOTE_ID, confirmPreviewFixture, ok, routeGets } from '../test-support/request-fixtures';

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: mockReplace }),
  useLocalSearchParams: () => ({ bookingId: 'booking-req-1', quoteId: 'quote-1' }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 390, breakpoint: 'phone', isPhone: true, isTablet: false, isDesktop: false }),
}));

import ConfirmQuoteScreen from '../app/customer/booking/confirm-quote';

it('HA-M2-195: Confirm booking calls accept, then replaces to the pay screen saying payment confirms the booking', async () => {
  routeGets({ [`/api/v1/bookings/${BOOKING_ID}/quotes/${QUOTE_ID}/confirm-preview`]: ok(confirmPreviewFixture()) });
  jest.mocked(api.post).mockReset();
  jest.mocked(api.post).mockResolvedValue({ data: { success: true, data: {
    quoteId: QUOTE_ID, providerId: 'provider-1', totalAmount: 198000, scheduledAt: '2026-10-15T00:00:00.000Z', scheduledWindow: 'morning',
  } } } as never);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><ConfirmQuoteScreen /></QueryClientProvider>);

  fireEvent.click(await screen.findByRole('button', { name: 'Confirm booking' }));

  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith({
    pathname: '/customer/booking/pay',
    params: { bookingId: BOOKING_ID },
  }));
  expect(api.post).toHaveBeenCalledTimes(1);
  expect(api.post).toHaveBeenCalledWith(`/api/v1/bookings/${BOOKING_ID}/quotes/${QUOTE_ID}/accept`, {});
  // Accept happened before leaving for payment.
  expect(jest.mocked(api.post).mock.invocationCallOrder[0]!).toBeLessThan(mockReplace.mock.invocationCallOrder[0]!);
  expect(useToastStore.getState().message).toBe('Quote accepted. Pay now to confirm your booking.');
});
