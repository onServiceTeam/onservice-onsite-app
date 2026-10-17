// Customer review 2026-10-18, old fixed-price screens cleaned (D41 Q39 option
// a with Q6 and Q33, finish-path-8): if request-first booking is ever
// switched off, the old checkout must not bring back escrow claims, the Suki
// points line (Suki is hidden) or the "Verified escrow" trust strip. They are
// removed and nothing replaces them.
import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn(), push: jest.fn(), replace: jest.fn() }) }));
jest.mock('@/hooks/useResponsive', () => ({ useResponsive: () => ({ isPhone: true }) }));
jest.mock('@/services/payment.service', () => ({
  createPaymentIntent: jest.fn(),
  getWalletBalance: jest.fn().mockResolvedValue({ availableBalance: 500000 }),
}));
// The old screen in the state it serves: request-first booking switched off.
jest.mock('@/hooks/useRequestFirstBooking', () => ({
  useRequestFirstBooking: () => false,
  useRequestFirstBookingState: () => ({ requestFirst: false, settled: true }),
}));

import CheckoutScreen from '../app/customer/booking/checkout';
import { useBookingStore } from '../src/stores/booking.store';

it('Bug CR-296 — the old checkout shows no escrow claim, no Suki points line and no trust strip', async () => {
  useBookingStore.getState().reset();
  useBookingStore.getState().setCategory('category-1', 'Cleaning', 'cleaning');
  useBookingStore.getState().setSubcategory('service-1', 'Deep Cleaning', 150000, { pricingType: 'fixed' });
  useBookingStore.getState().setSchedule('2026-10-20', '09:00');
  useBookingStore.getState().setAddress({
    address: '12 Gorordo Avenue', barangay: 'Lahug', city: 'Cebu City', province: 'Cebu', latitude: 10.33, longitude: 123.9,
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const { container } = render(<QueryClientProvider client={client}><CheckoutScreen /></QueryClientProvider>);

  expect(await screen.findByText('Choose Payment Method')).toBeTruthy();
  expect(screen.getByText(/itemized total above is the amount this wallet payment will charge/i)).toBeTruthy();
  expect(container.textContent).not.toMatch(/escrow/i);
  expect(container.textContent).not.toMatch(/Suki/i);
  expect(container.textContent).not.toMatch(/Vetted pros/i);
  expect(screen.queryByLabelText(/Vetted pros, verified payments use escrow/)).toBeNull();
  expect(screen.queryByRole('button', { name: 'Open payment safety and support information' })).toBeNull();
});
