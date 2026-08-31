import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn() }), useLocalSearchParams: () => ({}) }));
jest.mock('@/services/booking.service', () => ({ getBookingById: jest.fn() }));
jest.mock('@/services/booking-photo.service', () => ({ listBookingPhotos: jest.fn() }));

import BookingPhotosScreen from '../app/customer/booking/photos';

it('Bug UX-627 — job evidence without a booking does not claim that valid evidence tabs are empty', () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><BookingPhotosScreen /></QueryClientProvider>);

  expect(screen.getByText('Booking evidence unavailable')).toBeTruthy();
  expect(screen.getByText(/photos and uploader records stay attached/i)).toBeTruthy();
  expect(screen.queryByText('No Before Evidence')).toBeNull();
});
