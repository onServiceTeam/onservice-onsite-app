// Customer review 2026-10-18, old fixed-price bookings (D41 Q39 option a),
// P2 fix round: while the app is still asking the server whether request-first
// booking is on, the old checkout shows a neutral loading state. It must not
// show the old screen with its Pay button in that moment: if request-first is
// on, the server would refuse the booking with "Please update the app." even
// on the newest app. Once the server says request-first is on, the request
// form opens; no booking is ever created.
import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
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

it('Bug CR-297 — while the config is still loading, the old checkout shows a loading state and no Pay button', async () => {
  let answerConfig: (value: unknown) => void = () => undefined;
  (api.get as jest.Mock).mockReset().mockImplementation((url: string) =>
    url === '/api/v1/config'
      ? new Promise((resolve) => { answerConfig = resolve; })
      : Promise.resolve({ data: {} }),
  );
  useBookingStore.getState().reset();
  useBookingStore.getState().setCategory('category-1', 'Cleaning', 'cleaning');
  useBookingStore.getState().setSubcategory('service-1', 'Deep Cleaning', 150000, { pricingType: 'fixed' });
  useBookingStore.getState().setSchedule('2026-10-20', '09:00');
  useBookingStore.getState().setAddress({
    address: '12 Gorordo Avenue', barangay: 'Lahug', city: 'Cebu City', province: 'Cebu', latitude: 10.33, longitude: 123.9,
  });
  useBookingStore.getState().setPaymentMethod('wallet');
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><CheckoutScreen /></QueryClientProvider>);

  // The config has not answered: a loading state, no old screen, no Pay.
  await waitFor(() => expect(api.get).toHaveBeenCalledWith('/api/v1/config'));
  expect(screen.getByLabelText('Loading booking')).toBeTruthy();
  expect(screen.queryByRole('button', { name: /^Pay / })).toBeNull();
  expect(screen.queryByText(/^Pay /)).toBeNull();
  expect(screen.queryByText('Choose Payment Method')).toBeNull();
  expect(mockReplace).not.toHaveBeenCalled();

  // The server answers: request-first booking is on, so the request form opens.
  await act(async () => { answerConfig({ data: { success: true, data: { requestFirstBooking: true } } }); });
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/customer/booking/job-request'));
  expect(screen.queryByLabelText('Loading booking')).toBeNull();
  expect(screen.queryByText(/^Pay /)).toBeNull();
  expect(mockCreateBooking).not.toHaveBeenCalled();
});
