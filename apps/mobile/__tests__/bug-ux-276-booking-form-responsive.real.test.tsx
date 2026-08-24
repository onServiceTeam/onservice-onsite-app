import React from 'react';
import { render, screen } from '@testing-library/react';

jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn(), push: jest.fn() }) }));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1280, breakpoint: 'desktop', isPhone: false, isTablet: false, isDesktop: true }),
}));

import BookingFormScreen from '../app/customer/booking/form';
import { useBookingStore } from '../src/stores/booking.store';

it('Bug UX-276 — booking schedule, address, notes, and price summary form one bounded desktop workspace', () => {
  useBookingStore.getState().reset();
  useBookingStore.getState().setCategory('category-1', 'Cleaning', 'cleaning');
  useBookingStore.getState().setSubcategory('service-1', 'Deep Cleaning', 150000, { pricingType: 'fixed' });
  useBookingStore.getState().setAddress({
    address: '1 Market Street', barangay: 'Lahug', city: 'Cebu City', province: 'Cebu',
    latitude: 10.33, longitude: 123.9,
  });

  render(<BookingFormScreen />);

  expect(screen.getByLabelText('Tablet and desktop customer booking workspace')).toBeTruthy();
  expect(screen.getByText('Deep Cleaning')).toBeTruthy();
  expect(screen.getByText('Select Date')).toBeTruthy();
  expect(screen.getByText('Select Time')).toBeTruthy();
  expect(screen.getByText('Price Breakdown')).toBeTruthy();
});
