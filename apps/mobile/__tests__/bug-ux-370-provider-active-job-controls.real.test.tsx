import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn() }),
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
  getMyStaff: jest.fn().mockResolvedValue([
    { id: 'staff-1', status: 'approved', userName: 'Ana Reyes', roleTitle: 'Technician' },
  ]),
  assignStaffToBooking: jest.fn(),
}));
jest.mock('@/services/booking.service', () => ({
  getBookingById: jest.fn().mockResolvedValue({
    id: 'booking-active',
    status: 'provider_en_route',
    address: '22 Mango Avenue',
    barangay: 'Kamputhaw',
    city: 'Cebu City',
    latitude: null,
    longitude: null,
    scheduledAt: '2026-08-24T03:00:00.000Z',
    serviceName: 'Plumbing Repair',
    performerStaffId: null,
  }),
}));

import ActiveJobScreen from '../app/provider/job/active';

it('Bug UX-370 — the active-job workspace exposes clear map, chat, and assignment controls', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(
    <QueryClientProvider client={client}>
      <ActiveJobScreen />
    </QueryClientProvider>,
  );

  expect(await screen.findByLabelText('Tablet and desktop active provider job workspace')).toBeTruthy();
  expect(screen.getByLabelText('Job location map unavailable')).toBeTruthy();
  expect(screen.getByLabelText('Assign this job to me')).toBeTruthy();
  expect(screen.getByLabelText('Assign this job to Ana Reyes')).toBeTruthy();

  fireEvent.click(screen.getByLabelText('Chat with customer'));
  expect(mockPush).toHaveBeenCalledWith('/provider/chat/booking-active');
});
