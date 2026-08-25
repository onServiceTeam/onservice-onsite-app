import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockReplace = jest.fn();
const mockCreatePaymentIntent = jest.fn().mockResolvedValue({ id: 'intent-1', status: 'succeeded' });

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), replace: mockReplace }),
  useLocalSearchParams: () => ({ bookingId: 'booking-1' }),
}));

jest.mock('@/services/booking.service', () => ({
  getBookingById: jest.fn().mockResolvedValue({
    id: 'booking-1',
    status: 'payment_pending',
    createdAt: '2026-08-24T00:00:00.000Z',
    serviceName: 'Aircon cleaning',
    servicePrice: 100000,
    serviceFee: 10000,
    sukiDiscount: 0,
    totalAmount: 110000,
  }),
}));

jest.mock('@/services/payment.service', () => ({
  createPaymentIntent: (...args: unknown[]) => mockCreatePaymentIntent(...args),
  getWalletBalance: jest.fn().mockResolvedValue({ availableBalance: 200000 }),
}));

import PayExistingBookingScreen from '../app/customer/booking/pay';

it('BUG-PHASE86-01 — a payment-pending booking can be paid from an existing wallet balance', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(
    <QueryClientProvider client={client}>
      <PayExistingBookingScreen />
    </QueryClientProvider>,
  );

  await screen.findByText('Complete Payment');
  fireEvent.click(screen.getByRole('radio', { name: /Wallet Balance/i }));

  const payButton = screen.getByRole('button', { name: /Pay ₱1,100\.00/i });
  await waitFor(() => expect((payButton as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(payButton);

  await waitFor(() => {
    expect(mockCreatePaymentIntent).toHaveBeenCalledWith('booking-1', 'wallet');
    expect(mockReplace).toHaveBeenCalledWith({
      pathname: '/customer/booking/confirm',
      params: { bookingId: 'booking-1' },
    });
  });
});
