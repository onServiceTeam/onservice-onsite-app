import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockPatch = jest.fn().mockResolvedValue({ data: {} });
const mockShowToast = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'booking-1' }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 768, breakpoint: 'tablet', isPhone: false, isTablet: true, isDesktop: false }),
}));
jest.mock('@/services/api', () => ({
  __esModule: true,
  default: { patch: (...args: unknown[]) => mockPatch(...args) },
}));
jest.mock('@/lib/toast', () => ({ showToast: (...args: unknown[]) => mockShowToast(...args) }));
jest.mock('@/services/booking.service', () => ({
  getBookingById: jest.fn().mockResolvedValue({
    id: 'booking-1', customerId: 'customer-1', providerId: 'provider-1', bookingType: 'fixed_price',
    status: 'paid', escrowStatus: 'held', servicePrice: 100000, serviceFee: 0, totalAmount: 100000,
    description: 'Repair cabinet door', scheduledAt: '2026-08-24T01:00:00.000Z',
    createdAt: '2026-08-23T01:00:00.000Z', providerName: 'Cebu Prime', serviceName: 'Cabinet Repair',
    jobPhotos: [], providerBeforePhotos: [], providerAfterPhotos: [],
  }),
  getMyDisputes: jest.fn(),
}));
jest.mock('@/services/booking-photo.service', () => ({ listBookingPhotos: jest.fn().mockResolvedValue([]) }));

import BookingDetailScreen from '../app/customer/booking/[id]';

it('Bug UX-211 — customer cancellation confirms the record without falsely claiming an automatic refund', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><BookingDetailScreen /></QueryClientProvider>);

  fireEvent.click(await screen.findByRole('button', { name: 'Cancel Booking' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirm Cancellation' }));
  fireEvent.click(screen.getByRole('button', { name: 'Yes, cancel' }));

  await waitFor(() => expect(mockPatch).toHaveBeenCalledTimes(1));
  expect(mockShowToast).toHaveBeenCalledWith(
    'Booking cancelled. Check the booking payment details for any refund status and reference.',
    'success',
  );
  expect(mockShowToast).not.toHaveBeenCalledWith(expect.stringContaining('processed automatically'), expect.anything());
});
