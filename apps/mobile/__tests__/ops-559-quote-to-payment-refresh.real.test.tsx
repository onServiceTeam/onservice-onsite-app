// OPS-559 supporting checks (the API bug test is
// packages/api/__tests__/bug-ops-559-accepted-quote-unpayable.test.ts).
// Accepting a quote moves the booking from 'quoted' to 'payment_pending', and
// paying moves it to 'paid' and debits the wallet. The app must not keep
// showing the old status or balance from its cache. The query client here
// uses the app's 5-minute staleTime (app/_layout.tsx), so a cached booking is
// not refetched on its own.
import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { Text } from 'react-native';

const mockReplace = jest.fn();
let mockBookingId = 'booking-quote';
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), replace: mockReplace }),
  useLocalSearchParams: () => ({ bookingId: mockBookingId }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1280, breakpoint: 'desktop', isPhone: false, isTablet: false, isDesktop: true }),
}));

const mockGetBookingById = jest.fn();
const mockAcceptQuote = jest.fn();
jest.mock('@/services/booking.service', () => ({
  getBookingQuotes: jest.fn().mockResolvedValue([{
    id: 'quote-1',
    bookingId: 'booking-quote',
    providerId: 'provider-1',
    providerName: 'Cebu Cooling',
    providerRating: 4.8,
    providerTotalJobs: 42,
    quotedPrice: 150000,
    description: 'Complete aircon cleaning with inspection.',
    lineItems: [],
    laborAmount: 150000,
    materialsAmount: 0,
    estimatedDays: 1,
    notes: null,
    status: 'submitted',
    expiresAt: '2099-08-25T00:00:00.000Z',
  }]),
  acceptQuote: (...args: unknown[]) => mockAcceptQuote(...args),
  declineQuote: jest.fn(),
  getBookingById: (...args: unknown[]) => mockGetBookingById(...args),
}));

const mockCreatePaymentIntent = jest.fn();
const mockGetWalletBalance = jest.fn();
jest.mock('@/services/payment.service', () => ({
  createPaymentIntent: (...args: unknown[]) => mockCreatePaymentIntent(...args),
  getWalletBalance: (...args: unknown[]) => mockGetWalletBalance(...args),
}));

import { getBookingById } from '@/services/booking.service';
import QuotesScreen from '../app/customer/booking/quotes';
import PayExistingBookingScreen from '../app/customer/booking/pay';

function appQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 5 * 60 * 1000 } } });
}

// Stands in for the booking detail screen, which stays mounted underneath the
// quotes and pay screens and reads the same ['booking', id] query.
function BookingDetailUnderneath({ id }: { id: string }): React.ReactElement {
  const { data } = useQuery({
    queryKey: ['booking', id],
    queryFn: () => getBookingById(id),
  });
  return <Text>{`Detail status: ${(data as { status?: string } | undefined)?.status ?? 'none'}`}</Text>;
}

const paymentPendingBooking = {
  id: 'booking-1',
  status: 'payment_pending',
  createdAt: '2026-08-24T00:00:00.000Z',
  serviceName: 'Aircon cleaning',
  servicePrice: 100000,
  serviceFee: 10000,
  sukiDiscount: 0,
  totalAmount: 110000,
};

beforeEach(() => {
  jest.clearAllMocks();
});

it('accepting a quote refreshes the cached booking (still "quoted"), including the screen underneath, and the booking lists', async () => {
  mockBookingId = 'booking-quote';
  mockAcceptQuote.mockResolvedValue({ quoteId: 'quote-1', providerId: 'provider-1', totalAmount: 187500 });
  mockGetBookingById.mockResolvedValue({ id: 'booking-quote', status: 'payment_pending' });
  const client = appQueryClient();
  client.setQueryData(['booking', 'booking-quote'], { id: 'booking-quote', status: 'quoted' });
  client.setQueryData(['bookings'], [{ id: 'booking-quote', status: 'quoted' }]);
  client.setQueryData(['activeBookings'], [{ id: 'booking-quote', status: 'quoted' }]);

  render(
    <QueryClientProvider client={client}>
      <BookingDetailUnderneath id="booking-quote" />
      <QuotesScreen />
    </QueryClientProvider>,
  );
  expect(await screen.findByText('Detail status: quoted')).toBeTruthy();
  fireEvent.click(await screen.findByRole('button', { name: 'Accept quote from Cebu Cooling' }));
  fireEvent.click(within(screen.getByRole('alert')).getByRole('button', { name: 'Accept Quote' }));

  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith({
    pathname: '/customer/booking/pay',
    params: { bookingId: 'booking-quote' },
  }));
  // The screen underneath refetches and shows the new status.
  expect(await screen.findByText('Detail status: payment_pending')).toBeTruthy();
  expect(client.getQueryState(['bookings'])?.isInvalidated).toBe(true);
  expect(client.getQueryState(['activeBookings'])?.isInvalidated).toBe(true);
});

it('a successful wallet payment shows a loading state while leaving, and refreshes the booking, lists, balance and history', async () => {
  mockBookingId = 'booking-1';
  mockGetBookingById
    .mockResolvedValueOnce(paymentPendingBooking)
    .mockResolvedValue({ ...paymentPendingBooking, status: 'paid' });
  mockGetWalletBalance.mockResolvedValue({ availableBalance: 200000 });
  mockCreatePaymentIntent.mockResolvedValue({ id: 'intent-1', status: 'succeeded' });
  const client = appQueryClient();
  client.setQueryData(['bookings'], []);
  client.setQueryData(['activeBookings'], []);
  client.setQueryData(['bookingDetail', 'booking-1'], paymentPendingBooking);
  client.setQueryData(['walletTransactions', 'all'], []);

  render(<QueryClientProvider client={client}><PayExistingBookingScreen /></QueryClientProvider>);
  await screen.findByText('Complete Payment');
  fireEvent.click(screen.getByRole('radio', { name: /Wallet Balance/i }));
  const payButton = screen.getByRole('button', { name: /Pay ₱1,100\.00/i });
  await waitFor(() => expect((payButton as HTMLButtonElement).disabled).toBe(false));
  expect(mockGetBookingById).toHaveBeenCalledTimes(1);
  expect(mockGetWalletBalance).toHaveBeenCalledTimes(1);

  fireEvent.click(payButton);

  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith({
    pathname: '/customer/booking/confirm',
    params: { bookingId: 'booking-1' },
  }));
  // The booking and balance on screen were fetched again ...
  await waitFor(() => {
    expect(mockGetBookingById).toHaveBeenCalledTimes(2);
    expect(mockGetWalletBalance).toHaveBeenCalledTimes(2);
  });
  // ... yet the leaving screen never says the now-paid booking is "not awaiting payment".
  expect(screen.queryByText('This booking is not awaiting payment.')).toBeNull();
  for (const key of [['bookings'], ['activeBookings'], ['bookingDetail', 'booking-1'], ['walletTransactions', 'all']]) {
    expect(client.getQueryState(key)?.isInvalidated).toBe(true);
  }
});
