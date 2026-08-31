import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn() }),
  useLocalSearchParams: () => ({ bookingId: 'booking-1' }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1100, breakpoint: 'desktop', isPhone: false, isTablet: false, isDesktop: true }),
}));
jest.mock('@/services/booking.service', () => ({
  getBookingById: jest.fn().mockResolvedValue({
    id: 'booking-1', providerBeforePhotos: [], providerAfterPhotos: [], jobPhotos: [],
  }),
}));
jest.mock('@/services/booking-photo.service', () => ({
  listBookingPhotos: jest.fn().mockRejectedValue(new Error('evidence unavailable')),
}));

import BookingPhotosScreen from '../app/customer/booking/photos';

it('Bug UX-615 — failed canonical evidence history is not presented as a verified zero count', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><BookingPhotosScreen /></QueryClientProvider>);

  expect(await screen.findByText(/couldn't load the canonical job evidence/i)).toBeTruthy();
  expect(screen.getByText('—')).toBeTruthy();
  expect(screen.queryByText('0', { exact: true })).toBeNull();
});
