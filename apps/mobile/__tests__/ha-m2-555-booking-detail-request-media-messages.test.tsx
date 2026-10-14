// HA-M2-555 (D38 Milestone 2, package P5b): the booking screen of a request
// shows what the customer sent (the shared request gallery) and offers
// Messages, where each pro's thread lives.
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ok, routeGets } from '../test-support/request-fixtures';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'booking-req-1' }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1024, breakpoint: 'desktop', isPhone: false, isTablet: false, isDesktop: true }),
}));
jest.mock('@/services/booking.service', () => ({
  getBookingById: jest.fn().mockResolvedValue({
    id: 'booking-req-1', customerId: 'customer-1', providerId: null, categoryId: 'category-1',
    subcategoryId: 'service-1', bookingType: 'quote_based', status: 'requested', escrowStatus: 'pending',
    servicePrice: 0, serviceFee: 0, totalAmount: 0, description: 'Bedroom aircon blows warm air.',
    address: '42 Governor Cuenco Avenue', barangay: 'Kasambagan', city: 'Cebu City', province: 'Cebu',
    latitude: 10.3294, longitude: 123.9124, scheduledAt: '2026-10-14T05:00:00.000Z',
    completedAt: null, confirmedAt: null, cancelledAt: null, paymentMethod: null, surgeAmount: 0, sukiDiscount: 0,
    jobPhotos: [], providerBeforePhotos: [], providerAfterPhotos: [], createdAt: '2026-10-14T01:00:00.000Z',
    serviceName: 'Aircon repair', categoryName: 'Aircon Services',
  }),
  getMyDisputes: jest.fn(),
}));
jest.mock('@/services/booking-photo.service', () => ({ listBookingPhotos: jest.fn().mockResolvedValue([]) }));
jest.mock('@/services/booking-proof.service', () => ({ getBookingProofSummary: jest.fn().mockRejectedValue(new Error('not ready')) }));

import BookingDetailScreen from '../app/customer/booking/[id]';

it('HA-M2-555: a request\'s booking screen shows "What you sent" and its Messages entry opens the Messages tab', async () => {
  routeGets({
    '/api/v1/job-media/booking/booking-req-1': ok({
      items: [{ id: 'photo-1', purpose: 'job_request', kind: 'photo', status: 'attached', mime: 'image/jpeg', sizeBytes: 1000, durationMs: null, width: 800, height: 600, createdAt: '2026-10-14T01:00:00.000Z', url: '/api/v1/job-media/file/photo-1-token', expiresAt: '2026-10-14T01:10:00.000Z' }],
      legacyPhotos: [],
    }),
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const { container } = render(<QueryClientProvider client={client}><BookingDetailScreen /></QueryClientProvider>);

  expect(await screen.findByText('What you sent')).toBeTruthy();
  expect(container.querySelector('[accessibilitylabel="Job photo 1"]')?.getAttribute('source')).toContain('/api/v1/job-media/file/photo-1-token');
  // No quote yet: no View Quotes, but the request status and Messages are there.
  expect(screen.queryByRole('button', { name: 'View Quotes' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Open messages with pros' }));
  expect(mockPush).toHaveBeenLastCalledWith('/(tabs)/messages');
});
