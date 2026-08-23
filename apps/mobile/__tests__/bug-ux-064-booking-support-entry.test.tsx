import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn() }),
  useLocalSearchParams: () => ({ id: '11111111-1111-4111-8111-111111111111' }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 390, breakpoint: 'phone', isPhone: true, isTablet: false, isDesktop: false }),
}));
jest.mock('@/services/booking.service', () => ({
  getBookingById: jest.fn().mockResolvedValue({
    id: '11111111-1111-4111-8111-111111111111',
    status: 'matched',
    bookingType: 'fixed_price',
    servicePrice: 100000,
    serviceFee: 0,
    totalAmount: 100000,
    scheduledAt: '2026-08-25T01:00:00.000Z',
    createdAt: '2026-08-24T01:00:00.000Z',
    address: '88 Banilad Road',
    barangay: 'Banilad',
    city: 'Mandaue City',
    providerId: 'provider-1',
    providerName: 'Cebu Prime Services',
    serviceName: 'Aircon cleaning',
    jobPhotos: [],
    providerBeforePhotos: [],
    providerAfterPhotos: [],
  }),
}));
jest.mock('@/services/booking-photo.service', () => ({
  listBookingPhotos: jest.fn().mockResolvedValue([]),
}));

import BookingDetailScreen from '../app/customer/booking/[id]';

it('Bug UX-064 — every customer booking exposes a support action with that booking attached', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><BookingDetailScreen /></QueryClientProvider>);

  fireEvent.click(await screen.findByRole('button', { name: 'Get Support' }));
  expect(mockPush).toHaveBeenCalledWith(expect.objectContaining({
    pathname: '/support/new',
    params: expect.objectContaining({
      bookingId: '11111111-1111-4111-8111-111111111111',
      type: 'booking_issue',
    }),
  }));
});
