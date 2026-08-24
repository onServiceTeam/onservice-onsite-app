import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockPush = jest.fn();
const mockUpdateBookingStatus = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn() }),
  useLocalSearchParams: () => ({ bookingId: 'booking-2' }),
}));
jest.mock('@/hooks/useLocation', () => ({
  useLocation: () => ({ getCurrentLocation: jest.fn(), isLoading: false }),
}));
jest.mock('@/services/provider-api.service', () => ({
  updateBookingStatus: (...args: unknown[]) => mockUpdateBookingStatus(...args),
}));
jest.mock('@/services/provider-staff.service', () => ({
  getMyStaff: jest.fn().mockResolvedValue([]), assignStaffToBooking: jest.fn(),
}));
jest.mock('@/services/booking.service', () => ({
  getBookingById: jest.fn().mockResolvedValue({
    id: 'booking-2', status: 'in_progress', address: '22 Mango Avenue',
    barangay: 'Kamputhaw', city: 'Cebu City', latitude: '10.32', longitude: '123.90',
    scheduledAt: '2026-08-24T03:00:00.000Z', serviceName: 'Plumbing Repair',
  }),
}));

import ActiveJobScreen from '../app/provider/job/active';

it('BUG-UX-155 — active jobs enter the completion evidence workflow instead of patching status directly', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><ActiveJobScreen /></QueryClientProvider>);

  fireEvent.click(await screen.findByText('Review & Complete'));

  expect(mockPush).toHaveBeenCalledWith('/provider/job/booking-2/complete');
  expect(mockUpdateBookingStatus).not.toHaveBeenCalled();
});
