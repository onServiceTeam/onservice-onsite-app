// Customer review 2026-10-18, old fixed-price bookings (D41 Q39 option a):
// while request-first booking is on, the old checkout is not used (the server
// also refuses new fixed-price bookings then). A customer who still reaches it
// with a full draft is sent to the request form; no Pay button is shown and
// no booking is created.
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import api from '@/services/api';

const mockReplace = jest.fn();
const mockCreateBooking = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn(), push: jest.fn(), replace: mockReplace }) }));
jest.mock('@/hooks/useResponsive', () => ({ useResponsive: () => ({ isPhone: true }) }));
jest.mock('@/services/booking.service', () => ({ createBooking: (...a: unknown[]) => mockCreateBooking(...a) }));
jest.mock('@/services/payment.service', () => ({
  createPaymentIntent: jest.fn(),
  getWalletBalance: jest.fn().mockResolvedValue({ availableBalance: 500000 }),
}));

import CheckoutScreen from '../app/customer/booking/checkout';
import { useBookingStore } from '../src/stores/booking.store';

it('Bug CR-293 — with request-first booking on, the old checkout opens the request form and shows no Pay button', async () => {
  (api.get as jest.Mock).mockReset().mockResolvedValue({ data: { success: true, data: { requestFirstBooking: true } } });
  useBookingStore.getState().reset();
  useBookingStore.getState().setCategory('category-1', 'Cleaning', 'cleaning');
  useBookingStore.getState().setSubcategory('service-1', 'Deep Cleaning', 150000, { pricingType: 'fixed' });
  useBookingStore.getState().setSchedule('2026-10-20', '09:00');
  useBookingStore.getState().setAddress({
    address: '12 Gorordo Avenue', barangay: 'Lahug', city: 'Cebu City', province: 'Cebu', latitude: 10.33, longitude: 123.9,
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><CheckoutScreen /></QueryClientProvider>);

  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/customer/booking/job-request'));
  expect(screen.getByLabelText('Opening the request form')).toBeTruthy();
  expect(screen.queryByRole('button', { name: /^Pay / })).toBeNull();
  expect(screen.queryByText('Choose Payment Method')).toBeNull();
  expect(mockCreateBooking).not.toHaveBeenCalled();
});
