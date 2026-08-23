import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'booking-1' }),
}));

jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 820, breakpoint: 'tablet', isPhone: false, isTablet: true, isDesktop: false }),
}));

jest.mock('@/services/booking.service', () => ({
  getBookingById: jest.fn().mockResolvedValue({
    id: 'booking-1',
    customerId: 'customer-1',
    providerId: 'provider-1',
    categoryId: 'category-1',
    subcategoryId: 'subcategory-1',
    bookingType: 'fixed_price',
    status: 'in_progress',
    escrowStatus: 'funded',
    servicePrice: 120000,
    serviceFee: 0,
    totalAmount: 120000,
    description: 'Clean one split-type air conditioner',
    address: '88 Banilad Road',
    barangay: 'Banilad',
    city: 'Mandaue City',
    province: 'Cebu',
    latitude: null,
    longitude: null,
    scheduledAt: '2026-08-24T01:00:00.000Z',
    completedAt: null,
    confirmedAt: null,
    cancelledAt: null,
    cancellationReason: null,
    paymentMethod: 'wallet',
    surgeMultiplier: 1,
    surgeAmount: 0,
    rebookedFromId: null,
    sukiDiscount: 0,
    jobPhotos: [],
    providerBeforePhotos: [],
    providerAfterPhotos: [],
    createdAt: '2026-08-23T01:00:00.000Z',
    providerName: 'Cebu Prime Services',
    serviceName: 'Split-Type Cleaning',
  }),
  cancelBooking: jest.fn(),
}));

jest.mock('@/services/booking-photo.service', () => ({
  listBookingPhotos: jest.fn().mockResolvedValue([]),
}));

import BookingDetailScreen from '../app/customer/booking/[id]';

it('Bug UX-019 — booking detail renders a persistent tablet and desktop summary workspace', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><BookingDetailScreen /></QueryClientProvider>);

  const workspace = await screen.findByLabelText('Booking details workspace');
  const sidebar = screen.getByLabelText('Booking summary and actions');
  const trackAction = screen.getByText('Track Booking');
  expect(workspace.contains(sidebar)).toBe(true);
  expect(sidebar.contains(trackAction)).toBe(true);
});
