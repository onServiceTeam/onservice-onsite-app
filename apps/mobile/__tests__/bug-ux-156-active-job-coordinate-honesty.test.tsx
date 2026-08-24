import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({ bookingId: 'booking-2' }),
}));
jest.mock('@/hooks/useLocation', () => ({
  useLocation: () => ({ getCurrentLocation: jest.fn(), isLoading: false }),
}));
jest.mock('@/services/provider-api.service', () => ({ updateBookingStatus: jest.fn() }));
jest.mock('@/services/provider-staff.service', () => ({
  getMyStaff: jest.fn().mockResolvedValue([]), assignStaffToBooking: jest.fn(),
}));
jest.mock('@/services/booking.service', () => ({
  getBookingById: jest.fn().mockResolvedValue({
    id: 'booking-2', status: 'provider_en_route', address: '22 Mango Avenue',
    barangay: 'Kamputhaw', city: 'Cebu City', latitude: null, longitude: null,
    scheduledAt: '2026-08-24T03:00:00.000Z', serviceName: 'Plumbing Repair',
  }),
}));

import ActiveJobScreen from '../app/provider/job/active';

it('BUG-UX-156 — an address-only active job does not display a fake map location', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><ActiveJobScreen /></QueryClientProvider>);

  expect(await screen.findByText('Job coordinates unavailable')).toBeTruthy();
  expect(screen.getByText(/No map pin or route is shown/)).toBeTruthy();
  expect(screen.getByLabelText('Open directions')).toBeTruthy();
});
