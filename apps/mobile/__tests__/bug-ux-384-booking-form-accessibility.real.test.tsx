import React from 'react';
import { render, screen } from '@testing-library/react';

jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn(), push: jest.fn() }) }));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1280, breakpoint: 'desktop', isPhone: false, isTablet: false, isDesktop: true }),
}));

import BookingFormScreen from '../app/customer/booking/form';
import { useBookingStore } from '../src/stores/booking.store';

it('Bug UX-384 — the customer booking form exposes named address, date, time, notes, and navigation controls', () => {
  useBookingStore.getState().reset();
  useBookingStore.getState().setCategory('category-1', 'Cleaning', 'cleaning');
  useBookingStore.getState().setSubcategory('service-1', 'Deep Cleaning', 150000, { pricingType: 'fixed' });
  useBookingStore.getState().setAddress({
    address: '1 Market Street', barangay: 'Lahug', city: 'Cebu City', province: 'Cebu', latitude: 10.33, longitude: 123.9,
  });

  render(<BookingFormScreen />);

  expect(screen.getByRole('button', { name: 'Go back from booking' })).toBeTruthy();
  expect(screen.getByRole('button', { name: /Change service address/i })).toBeTruthy();
  expect(screen.getAllByRole('button', { name: /^Select date /i })).toHaveLength(14);
  expect(screen.getByRole('button', { name: 'Select time 08:00' })).toBeTruthy();
  expect(screen.getByPlaceholderText('Describe any special requirements...')).toBeTruthy();
});
