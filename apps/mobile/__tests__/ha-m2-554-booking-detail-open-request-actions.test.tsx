// HA-M2-554 (D38 Milestone 2, package P5b): the booking screen of an open
// request with a quote waiting says the schedule is "To be agreed with the
// pro" (the stored time is a placeholder until a pro's slot is accepted),
// offers Request status and View Quotes, and shows no ₱0 receipt.
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

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
    subcategoryId: 'service-1', bookingType: 'quote_based', status: 'quoted', escrowStatus: 'pending',
    servicePrice: 0, serviceFee: 0, totalAmount: 0, description: 'Bedroom aircon blows warm air.',
    address: '42 Governor Cuenco Avenue', barangay: 'Kasambagan', city: 'Cebu City', province: 'Cebu',
    latitude: 10.3294, longitude: 123.9124,
    // The placeholder time createJobRequest stores; not a real appointment.
    scheduledAt: '2026-10-14T05:00:00.000Z',
    completedAt: null, confirmedAt: null, cancelledAt: null, paymentMethod: null, surgeAmount: 0, sukiDiscount: 0,
    jobPhotos: [], providerBeforePhotos: [], providerAfterPhotos: [], createdAt: '2026-10-14T01:00:00.000Z',
    serviceName: 'Aircon repair', categoryName: 'Aircon Services',
  }),
  getMyDisputes: jest.fn(),
}));
jest.mock('@/services/booking-photo.service', () => ({ listBookingPhotos: jest.fn().mockResolvedValue([]) }));
jest.mock('@/services/booking-proof.service', () => ({ getBookingProofSummary: jest.fn().mockRejectedValue(new Error('not ready')) }));

import BookingDetailScreen from '../app/customer/booking/[id]';

it('HA-M2-554: an open request reads "To be agreed with the pro" and offers Request status and View Quotes, with no ₱0 receipt', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const { container } = render(<QueryClientProvider client={client}><BookingDetailScreen /></QueryClientProvider>);

  expect(await screen.findByText('To be agreed with the pro')).toBeTruthy();
  expect(container.textContent).not.toContain('₱0.00');
  fireEvent.click(screen.getByRole('button', { name: 'Request status' }));
  expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/customer/booking/request-status', params: { bookingId: 'booking-req-1' } });
  fireEvent.click(screen.getByRole('button', { name: 'View Quotes' }));
  expect(mockPush).toHaveBeenLastCalledWith({ pathname: '/customer/booking/quotes', params: { bookingId: 'booking-req-1' } });
});
