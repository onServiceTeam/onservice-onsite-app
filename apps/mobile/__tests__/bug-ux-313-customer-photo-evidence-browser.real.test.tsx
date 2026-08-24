import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn() }),
  useLocalSearchParams: () => ({ bookingId: 'booking-1' }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({
    width: 1280,
    breakpoint: 'desktop',
    isPhone: false,
    isTablet: false,
    isDesktop: true,
  }),
}));
jest.mock('@/services/booking.service', () => ({
  getBookingById: jest.fn().mockResolvedValue({
    id: 'booking-1',
    serviceName: 'Deep Cleaning',
    categoryName: 'Cleaning',
    providerName: 'Cebu Prime Care',
    scheduledAt: '2026-08-25T02:00:00.000Z',
    address: 'Cebu City',
    providerBeforePhotos: [],
    providerAfterPhotos: [],
    jobPhotos: ['https://example.com/legacy-customer.jpg'],
  }),
}));
jest.mock('@/services/booking-photo.service', () => ({
  listBookingPhotos: jest.fn().mockResolvedValue([
    {
      id: 'photo-before',
      bookingId: 'booking-1',
      photoType: 'before',
      storageUrl: 'https://example.com/before.jpg',
      uploadedBy: 'provider-user',
      uploadedByRole: 'provider',
      uploadedAt: '2026-08-25T02:10:00.000Z',
    },
    {
      id: 'photo-work',
      bookingId: 'booking-1',
      photoType: 'during',
      storageUrl: 'https://example.com/work.jpg',
      uploadedBy: 'provider-user',
      uploadedByRole: 'provider',
      uploadedAt: '2026-08-25T03:00:00.000Z',
    },
  ]),
}));

import BookingPhotosScreen from '../app/customer/booking/photos';

it('Bug UX-313 — customer evidence waits for canonical records and exposes provider work proof with actor, type, and time in a wide browser workspace', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(
    <QueryClientProvider client={client}>
      <BookingPhotosScreen />
    </QueryClientProvider>,
  );

  expect(
    await screen.findByLabelText('Tablet and desktop customer job evidence workspace'),
  ).toBeTruthy();
  fireEvent.click(await screen.findByText('Work (1)'));

  expect(screen.getByLabelText('Open Provider · During evidence 1')).toBeTruthy();
  expect(screen.getByText('Provider · During')).toBeTruthy();
  expect(screen.queryByText('No Work Evidence')).toBeNull();

  fireEvent.click(screen.getByText('Customer (1)'));
  expect(screen.getByText('Legacy customer photo')).toBeTruthy();
  expect(screen.queryByText('Legacy record · During')).toBeNull();
});
