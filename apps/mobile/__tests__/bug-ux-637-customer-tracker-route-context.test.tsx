import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockGetBookingById = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));
jest.mock('react-native-maps', () => ({ __esModule: true, default: () => null, Marker: () => null }));
jest.mock('@/services/booking.service', () => ({ getBookingById: (...args: unknown[]) => mockGetBookingById(...args) }));
jest.mock('@/services/socket.service', () => ({ getSocket: jest.fn(), connectSocket: jest.fn() }));
jest.mock('@/hooks/useServiceAreaDefaults', () => ({ useServiceAreaDefaults: () => ({ mapRegion: null }) }));

import BookingTrackerScreen from '../app/customer/booking/tracker';

it('Bug UX-637 — tracking without a booking ID gives a truthful return path instead of a retry that cannot fetch', () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><BookingTrackerScreen /></QueryClientProvider>);

  expect(screen.getByText('Booking tracker unavailable')).toBeTruthy();
  expect(screen.getByText(/does not identify a booking/i)).toBeTruthy();
  expect(mockGetBookingById).not.toHaveBeenCalled();
});
