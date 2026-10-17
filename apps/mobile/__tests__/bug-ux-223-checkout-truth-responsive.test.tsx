import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// D41 Q39 (Ken, 2026-10-18): this old fixed-price screen is used only while
// request-first booking is off; with it on, the screen sends the customer to
// the request form. This test pins the screen in the switched-off state.
jest.mock('@/hooks/useRequestFirstBooking', () => ({
  useRequestFirstBooking: () => false,
  useRequestFirstBookingState: () => ({ requestFirst: false, settled: true }),
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn(), replace: jest.fn() }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1280, breakpoint: 'desktop', isPhone: false, isTablet: false, isDesktop: true }),
}));
jest.mock('@/services/payment.service', () => ({
  createPaymentIntent: jest.fn(),
  getWalletBalance: jest.fn().mockResolvedValue({ availableBalance: 200000 }),
}));

import CheckoutScreen from '../app/customer/booking/checkout';
import { useBookingStore } from '../src/stores/booking.store';

it('Bug UX-223 — desktop checkout removes the deferred guarantee and describes the actual wallet charge', async () => {
  useBookingStore.getState().reset();
  useBookingStore.getState().setCategory('category-1', 'Air Conditioning', 'air-conditioning');
  useBookingStore.getState().setSubcategory('subcategory-1', 'Aircon Cleaning', 120000, { pricingType: 'fixed' });
  useBookingStore.getState().setSchedule('2026-09-02', '09:00');
  useBookingStore.getState().setAddress({
    address: '88 Banilad Road', barangay: 'Banilad', city: 'Mandaue City', province: 'Cebu',
    latitude: 10.33, longitude: 123.9,
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><CheckoutScreen /></QueryClientProvider>);

  expect(await screen.findByLabelText('Desktop booking checkout workspace')).toBeTruthy();
  expect(screen.getByText(/itemized total above is the amount this wallet payment will charge/i)).toBeTruthy();
  // Updated 2026-10-18 (D41 Q6 and Q39, Ken): this test used to require the
  // line "Server-verified payment and escrow status stays visible". Ken chose
  // to remove escrow wording, so the old checkout no longer shows that line.
  expect(screen.queryByText(/escrow/i)).toBeNull();
  expect(screen.getByText(/external PayMongo payment methods are currently unavailable/i)).toBeTruthy();
  expect(screen.queryByText(/Service Guarantee/i)).toBeNull();
  expect(screen.queryByText(/up to ₱10,000/i)).toBeNull();
});
