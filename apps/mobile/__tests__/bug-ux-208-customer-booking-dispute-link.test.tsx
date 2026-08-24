import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'booking-1' }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 768, breakpoint: 'tablet', isPhone: false, isTablet: true, isDesktop: false }),
}));
jest.mock('@/services/booking.service', () => ({
  getBookingById: jest.fn().mockResolvedValue({
    id: 'booking-1', customerId: 'customer-1', providerId: 'provider-1', bookingType: 'fixed_price',
    status: 'disputed', escrowStatus: 'held', servicePrice: 100000, serviceFee: 0, totalAmount: 100000,
    description: 'Repair cabinet door', scheduledAt: '2026-08-24T01:00:00.000Z',
    createdAt: '2026-08-23T01:00:00.000Z', providerName: 'Cebu Prime', serviceName: 'Cabinet Repair',
    jobPhotos: [], providerBeforePhotos: [], providerAfterPhotos: [],
  }),
  getMyDisputes: jest.fn().mockResolvedValue({
    disputes: [{ id: 'dispute-1' }], page: 1, total: 1, totalPages: 1,
  }),
}));
jest.mock('@/services/booking-photo.service', () => ({ listBookingPhotos: jest.fn().mockResolvedValue([]) }));

import BookingDetailScreen from '../app/customer/booking/[id]';

it('Bug UX-208 — a customer booking with a case opens that case instead of offering a duplicate dispute', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><BookingDetailScreen /></QueryClientProvider>);

  expect(await screen.findByRole('button', { name: 'View Dispute Case' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'File a Dispute' })).toBeNull();
});
