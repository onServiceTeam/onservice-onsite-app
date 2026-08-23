import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({ bookingId: 'booking-1' }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1100, breakpoint: 'desktop', isPhone: false, isTablet: false, isDesktop: true }),
}));
jest.mock('react-native-maps', () => {
  const ReactModule = require('react');
  return {
    __esModule: true,
    default: ReactModule.forwardRef(({ children }: { children?: React.ReactNode }, ref: React.Ref<HTMLDivElement>) => (
      <div ref={ref}>{children}</div>
    )),
    Marker: ({ title }: { title: string }) => <span>{title}</span>,
  };
});
jest.mock('@/services/socket.service', () => ({
  connectSocket: () => ({ on: jest.fn() }),
  getSocket: () => null,
}));
jest.mock('@/services/booking.service', () => ({
  getBookingById: jest.fn().mockResolvedValue({
    id: 'booking-1',
    status: 'provider_en_route',
    scheduledAt: '2026-08-24T01:00:00.000Z',
    latitude: 10.3157,
    longitude: 123.8854,
    providerName: 'Cebu Prime Services',
    serviceName: 'Aircon Cleaning',
  }),
}));

import BookingTrackerScreen from '../app/customer/booking/tracker';

it('Bug UX-027 — booking tracking becomes a map-and-status workspace on tablet and desktop', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><BookingTrackerScreen /></QueryClientProvider>);

  const workspace = await screen.findByLabelText('Booking tracking workspace');
  const statusPanel = screen.getByLabelText('Booking tracking status and actions');
  expect(workspace.contains(statusPanel)).toBe(true);
  expect(screen.getByText('Provider is on the way')).toBeTruthy();
  expect(screen.getByLabelText('Chat with provider')).toBeTruthy();
});
