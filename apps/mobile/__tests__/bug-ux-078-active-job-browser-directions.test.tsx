import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn() }),
  useLocalSearchParams: () => ({ bookingId: 'booking-2' }),
}));
jest.mock('@/hooks/useLocation', () => ({
  useLocation: () => ({ getCurrentLocation: jest.fn(), isLoading: false }),
}));
jest.mock('@/services/provider-api.service', () => ({
  updateBookingStatus: jest.fn(),
}));
jest.mock('@/services/provider-staff.service', () => ({
  getMyStaff: jest.fn().mockResolvedValue([]),
  assignStaffToBooking: jest.fn(),
}));
jest.mock('@/services/booking.service', () => ({
  getBookingById: jest.fn().mockResolvedValue({
    id: 'booking-2',
    status: 'provider_en_route',
    address: '22 Mango Avenue',
    barangay: 'Kamputhaw',
    city: 'Cebu City',
    latitude: null,
    longitude: null,
    scheduledAt: '2026-08-24T03:00:00.000Z',
    serviceName: 'Plumbing Repair',
  }),
}));

import ActiveJobScreen from '../app/provider/job/active';

it('Bug UX-078 — the active-job directions control works with an address on browsers', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(
    <QueryClientProvider client={client}>
      <ActiveJobScreen />
    </QueryClientProvider>,
  );

  fireEvent.click(await screen.findByLabelText('Open directions'));

  expect(mockPush).toHaveBeenCalledWith('/provider/job/booking-2/navigate');
});
