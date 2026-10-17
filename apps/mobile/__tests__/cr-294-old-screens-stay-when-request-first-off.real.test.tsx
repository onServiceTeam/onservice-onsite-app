// Customer review 2026-10-18, old fixed-price bookings (D41 Q39): the old
// screens are kept for the day admin switches request-first booking off. With
// it off they work as before, and while the config is still loading they do
// not bounce the customer away to the request form.
//
// Updated in the P2 fix round: while the config is still loading, the screen
// now shows a neutral loading state instead of the old screen (before, the old
// screen showed at once, so its Pay button could be tapped before the app knew
// request-first was on). The rule that it never redirects before the config
// answers is unchanged.
import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import api from '@/services/api';

const mockReplace = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn(), push: jest.fn(), replace: mockReplace }) }));
jest.mock('@/hooks/useResponsive', () => ({ useResponsive: () => ({ isPhone: true, isDesktop: false }) }));

import BookingFormScreen from '../app/customer/booking/form';
import { useBookingStore } from '../src/stores/booking.store';

it('Bug CR-294 — with request-first booking off, the old booking screen stays, and while the config loads it waits without redirecting', async () => {
  let answerConfig: (value: unknown) => void = () => undefined;
  (api.get as jest.Mock).mockReset().mockImplementation(() => new Promise((resolve) => { answerConfig = resolve; }));
  useBookingStore.getState().reset();
  useBookingStore.getState().setCategory('category-1', 'Cleaning', 'cleaning');
  useBookingStore.getState().setSubcategory('service-1', 'Deep Cleaning', 150000, { pricingType: 'fixed' });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><BookingFormScreen /></QueryClientProvider>);

  // Config still loading: a neutral loading state, not the old screen, and
  // nothing redirects.
  await waitFor(() => expect(api.get).toHaveBeenCalledWith('/api/v1/config'));
  expect(screen.getByLabelText('Loading booking')).toBeTruthy();
  expect(screen.queryByText('Select Date')).toBeNull();
  expect(mockReplace).not.toHaveBeenCalled();

  // The server answers: request-first booking is off.
  await act(async () => { answerConfig({ data: { success: true, data: { requestFirstBooking: false } } }); });
  await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
  expect(mockReplace).not.toHaveBeenCalled();
  expect(screen.queryByLabelText('Loading booking')).toBeNull();
  expect(screen.getByText('Select Date')).toBeTruthy();
  expect(screen.getByText('Price Breakdown')).toBeTruthy();
});
