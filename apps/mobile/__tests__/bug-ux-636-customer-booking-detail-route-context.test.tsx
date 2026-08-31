import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockGetBookingById = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));
jest.mock('@/services/booking.service', () => ({
  getBookingById: (...args: unknown[]) => mockGetBookingById(...args),
  getMyDisputes: jest.fn(), cancelBooking: jest.fn(),
}));
jest.mock('@/services/booking-photo.service', () => ({ listBookingPhotos: jest.fn() }));
jest.mock('@/services/booking-proof.service', () => ({ getBookingProofSummary: jest.fn() }));

import BookingDetailScreen from '../app/customer/booking/[id]';

it('Bug UX-636 — booking detail without an ID gives a truthful return path instead of a connection retry that cannot run', () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><BookingDetailScreen /></QueryClientProvider>);

  expect(screen.getByText('Booking unavailable')).toBeTruthy();
  expect(screen.getByText(/does not identify a booking/i)).toBeTruthy();
  expect(mockGetBookingById).not.toHaveBeenCalled();
});
