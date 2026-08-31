import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'quote-booking' }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1024, breakpoint: 'desktop', isPhone: false, isTablet: false, isDesktop: true }),
}));
jest.mock('@/services/booking.service', () => ({
  getBookingById: jest.fn().mockResolvedValue({
    id: 'quote-booking', customerId: 'customer-1', providerId: null, categoryId: 'category-1',
    subcategoryId: 'service-1', bookingType: 'quote_based', status: 'requested', escrowStatus: 'pending',
    servicePrice: 0, serviceFee: 0, totalAmount: 0, description: 'Custom cabinet request',
    address: '42 Governor Cuenco Avenue', barangay: 'Kasambagan', city: 'Cebu City', province: 'Cebu',
    scheduledAt: null, completedAt: null, confirmedAt: null, cancelledAt: null, paymentMethod: null,
    surgeAmount: 0, sukiDiscount: 0, jobPhotos: [], providerBeforePhotos: [], providerAfterPhotos: [],
    createdAt: '2026-08-31T00:00:00.000Z', serviceName: 'Custom Cabinets', categoryName: 'Renovation',
  }),
  getMyDisputes: jest.fn(),
}));
jest.mock('@/services/booking-photo.service', () => ({ listBookingPhotos: jest.fn().mockResolvedValue([]) }));
jest.mock('@/services/booking-proof.service', () => ({ getBookingProofSummary: jest.fn().mockRejectedValue(new Error('not ready')) }));

import BookingDetailScreen from '../app/customer/booking/[id]';

it('Bug UX-622 — an unaccepted quote request does not present a zero-peso receipt as its price', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><BookingDetailScreen /></QueryClientProvider>);

  expect(await screen.findByLabelText('Quote pricing pending')).toBeTruthy();
  expect(screen.getByText(/No service price or payment is due yet/i)).toBeTruthy();
  expect(screen.queryByText('Receipt')).toBeNull();
});
