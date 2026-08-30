import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { getMyStaff } from '@/services/provider-staff.service';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({ bookingId: 'booking-active' }),
}));
jest.mock('@/hooks/useLocation', () => ({
  useLocation: () => ({ getCurrentLocation: jest.fn(), isLoading: false }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 820, breakpoint: 'tablet', isPhone: false, isTablet: true, isDesktop: false }),
}));
jest.mock('@/services/provider-api.service', () => ({ updateBookingStatus: jest.fn() }));
jest.mock('@/services/provider-staff.service', () => ({
  getMyStaff: jest.fn().mockRejectedValue(new Error('team unavailable')),
  assignStaffToBooking: jest.fn(),
}));
jest.mock('@/services/booking.service', () => ({
  getBookingById: jest.fn().mockResolvedValue({
    id: 'booking-active', status: 'provider_en_route', address: '22 Mango Avenue', city: 'Cebu City',
    latitude: null, longitude: null, scheduledAt: '2026-08-24T03:00:00.000Z',
    serviceName: 'Plumbing Repair', performerStaffId: null,
  }),
}));

import ActiveJobScreen from '../app/provider/job/active';

it('Bug UX-592 — active-job assignment reports an unavailable roster instead of silently hiding team controls', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><ActiveJobScreen /></QueryClientProvider>);

  expect(await screen.findByText('Team assignment unavailable')).toBeTruthy();
  expect(screen.queryByLabelText('Assign this job to me')).toBeNull();

  fireEvent.click(screen.getByRole('button', { name: 'Retry loading' }));
  await waitFor(() => expect(getMyStaff).toHaveBeenCalledTimes(2));
});
