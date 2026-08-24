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
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1280, breakpoint: 'desktop', isPhone: false, isTablet: false, isDesktop: true }),
}));
jest.mock('@/services/provider-api.service', () => ({ updateBookingStatus: jest.fn() }));
jest.mock('@/services/provider-staff.service', () => ({
  getMyStaff: jest.fn().mockResolvedValue([]), assignStaffToBooking: jest.fn(),
}));
jest.mock('@/services/booking.service', () => ({
  getBookingById: jest.fn().mockResolvedValue({
    id: 'booking-2', status: 'provider_en_route', address: '22 Mango Avenue',
    barangay: 'Kamputhaw', city: 'Cebu City', latitude: '10.32', longitude: '123.90',
    scheduledAt: '2026-08-24T03:00:00.000Z', serviceName: 'Plumbing Repair',
  }),
}));

import ActiveJobScreen from '../app/provider/job/active';

it('BUG-UX-157 — active jobs render a tablet and desktop map-and-controls workspace', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><ActiveJobScreen /></QueryClientProvider>);

  expect(await screen.findByLabelText('Tablet and desktop active provider job workspace')).toBeTruthy();
  expect(screen.getByText('Plumbing Repair')).toBeTruthy();
});
