import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'booking-1' }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1280, breakpoint: 'desktop', isPhone: false, isTablet: false, isDesktop: true }),
}));
jest.mock('@/hooks/useLocation', () => ({ useLocation: () => ({ getCurrentLocation: jest.fn(), isLoading: false }) }));
jest.mock('@/services/booking.service', () => ({
  getMyDisputes: jest.fn().mockResolvedValue({ disputes: [] }),
  getBookingById: jest.fn().mockResolvedValue({
    id: 'booking-1', customerId: 'customer-1', providerId: 'provider-1', categoryId: 'category-1', subcategoryId: 'subcategory-1',
    bookingType: 'fixed_price', status: 'matched', escrowStatus: 'held', servicePrice: 120000, serviceFee: 5000,
    totalAmount: 125000, description: 'Clean one split-type unit', address: '88 Banilad Road', barangay: 'Banilad',
    city: 'Mandaue City', province: 'Cebu', latitude: 10.33, longitude: 123.9, scheduledAt: '2026-08-27T01:00:00.000Z',
    completedAt: null, paymentMethod: 'wallet', surgeMultiplier: 1, surgeAmount: 0, sukiDiscount: 0, createdAt: '2026-08-25T01:00:00.000Z',
    providerName: 'Cebu Cooling Pro', customerName: 'Ana Santos', serviceName: 'Aircon Cleaning', jobPhotos: [], providerBeforePhotos: [], providerAfterPhotos: [],
  }),
}));
jest.mock('@/services/booking-photo.service', () => ({ listBookingPhotos: jest.fn().mockResolvedValue([]) }));
jest.mock('@/services/booking-proof.service', () => ({ getBookingProofSummary: jest.fn().mockResolvedValue(null) }));
jest.mock('@/services/provider-api.service', () => ({ updateBookingStatus: jest.fn() }));
jest.mock('@/services/api', () => ({
  __esModule: true,
  default: { get: jest.fn().mockResolvedValue({ data: { data: { tier: 'pro', commissionRate: 0.15 } } }), patch: jest.fn() },
}));

import BookingFormScreen from '../app/customer/booking/form';
import CustomerBookingDetail from '../app/customer/booking/[id]';
import ProviderJobDetail from '../app/provider/job/[id]';
import { useBookingStore } from '../src/stores/booking.store';

function client(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
}

it('Bug PHASE146-01 — booking notes and both participant cancellation reasons enforce their rendered server limits', async () => {
  useBookingStore.getState().reset();
  const form = render(<BookingFormScreen />);
  expect(screen.getByPlaceholderText('Describe any special requirements...').getAttribute('maxlength')).toBe('2000');
  form.unmount();

  const customer = render(<QueryClientProvider client={client()}><CustomerBookingDetail /></QueryClientProvider>);
  fireEvent.click(await screen.findByText('Cancel Booking'));
  expect(screen.getByLabelText('Cancellation reason').getAttribute('maxlength')).toBe('500');
  customer.unmount();

  render(<QueryClientProvider client={client()}><ProviderJobDetail /></QueryClientProvider>);
  fireEvent.click(await screen.findByText('Cancel Job'));
  expect(screen.getByLabelText('Provider cancellation reason').getAttribute('maxlength')).toBe('500');
});
