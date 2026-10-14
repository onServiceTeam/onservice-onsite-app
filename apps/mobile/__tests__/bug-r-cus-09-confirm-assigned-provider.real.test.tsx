// R-CUS-09 (1): after a customer accepted a pro's quote and paid, the
// confirmation screen still said "We're finding the best provider for you"
// and "You'll receive a notification once a provider accepts", although the
// pro was chosen when the quote was accepted (D38: acceptQuote sets
// provider_id). The screen now says who is coming and when, and that the pro
// is told in the app. A booking with no provider keeps the matching copy.
import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('expo-router', () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
  useLocalSearchParams: () => ({ bookingId: 'booking-1' }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 390, breakpoint: 'phone', isPhone: true, isTablet: false, isDesktop: false }),
}));

const mockGetBookingById = jest.fn();
jest.mock('@/services/booking.service', () => ({
  getBookingById: (...args: unknown[]) => mockGetBookingById(...args),
}));

import BookingConfirmScreen from '../app/customer/booking/confirm';

// The shape GET /api/v1/bookings/:id returns after acceptQuote: provider_id is
// set, provider_name comes from the providers/users join, and the accepted
// quote's slot is stored as scheduled_at (window start) plus scheduled_window.
// 2026-10-15T00:00Z is 8 AM in Manila, the start of the morning window.
const quoteBookingWithPro = {
  id: 'booking-1',
  bookingType: 'quote_based',
  status: 'paid',
  escrowStatus: 'held',
  providerId: 'provider-1',
  providerName: 'Juan Dela Cruz',
  categoryName: 'Aircon Cleaning',
  totalAmount: 150000,
  address: '42 Governor Cuenco Avenue',
  scheduledAt: '2026-10-15T00:00:00.000Z',
  scheduledWindow: 'morning',
};

function renderConfirm(booking: Record<string, unknown>): void {
  mockGetBookingById.mockResolvedValue(booking);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><BookingConfirmScreen /></QueryClientProvider>);
}

beforeEach(() => {
  mockGetBookingById.mockReset();
});

it('Bug R-CUS-09-01 — a paid booking that already has its pro names the pro instead of saying a provider is being found', async () => {
  renderConfirm(quoteBookingWithPro);

  expect(await screen.findByText('Booking Confirmed!')).toBeTruthy();
  expect(
    screen.getByText('Your booking shows paid with escrow held. Juan Dela Cruz is your provider for this job.'),
  ).toBeTruthy();
  expect(screen.queryByText(/finding the best provider/i)).toBeNull();
});

it('Bug R-CUS-09-02 — after paying, "What happens next" says who is coming, when, and that the pro is told in the app', async () => {
  renderConfirm(quoteBookingWithPro);

  expect(await screen.findByText('What happens next?')).toBeTruthy();
  expect(screen.getByText('Juan Dela Cruz is coming on October 15, 2026, morning (8 AM to 12 PM)')).toBeTruthy();
  expect(screen.getByText('Juan Dela Cruz is notified in the app that you have paid')).toBeTruthy();
  expect(screen.queryByText("We'll match you with a verified provider in your area")).toBeNull();
  expect(screen.queryByText("You'll receive a notification once a provider accepts")).toBeNull();
});

it('Bug R-CUS-09-03 — before paying, a booking with its pro says the pro is told once the customer pays, not that matching happens', async () => {
  renderConfirm({ ...quoteBookingWithPro, status: 'payment_pending', escrowStatus: 'none' });

  expect(await screen.findByText('Booking Submitted!')).toBeTruthy();
  expect(screen.getByText('Complete your payment to confirm this booking.')).toBeTruthy();
  expect(screen.getByText('Pay to confirm Juan Dela Cruz for October 15, 2026, morning (8 AM to 12 PM)')).toBeTruthy();
  expect(screen.getByText('Once you pay, Juan Dela Cruz is notified in the app')).toBeTruthy();
  expect(screen.queryByText("We'll match you with a verified provider in your area")).toBeNull();
  expect(screen.queryByText("You'll receive a notification once a provider accepts")).toBeNull();
  expect(screen.queryByText(/that you have paid/)).toBeNull();
});

it('a paid booking with no provider yet keeps the provider-matching copy', async () => {
  renderConfirm({
    ...quoteBookingWithPro,
    bookingType: 'fixed_price',
    escrowStatus: 'none',
    providerId: null,
    providerName: null,
    scheduledWindow: null,
  });

  expect(await screen.findByText('Booking Confirmed!')).toBeTruthy();
  expect(screen.getByText("Your booking shows paid. We're finding the best provider for you.")).toBeTruthy();
  expect(screen.getByText("We'll match you with a verified provider in your area")).toBeTruthy();
  expect(screen.getByText("You'll receive a notification once a provider accepts")).toBeTruthy();
  expect(screen.queryByText(/is notified in the app/)).toBeNull();
});
