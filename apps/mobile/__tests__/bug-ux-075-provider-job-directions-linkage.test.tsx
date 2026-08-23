import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'booking-1' }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1366, isPhone: false, isTablet: false, isDesktop: true }),
}));
jest.mock('@/hooks/useLocation', () => ({
  useLocation: () => ({ getCurrentLocation: jest.fn(), isLoading: false }),
}));
jest.mock('@/services/provider-api.service', () => ({
  updateBookingStatus: jest.fn(),
}));
jest.mock('@/services/booking.service', () => ({
  getBookingById: jest.fn().mockResolvedValue({
    id: 'booking-1',
    bookingType: 'fixed_price',
    status: 'provider_en_route',
    servicePrice: 120_000,
    address: '88 Banilad Road',
    barangay: 'Banilad',
    city: 'Mandaue City',
    latitude: null,
    longitude: null,
    scheduledAt: '2026-08-24T01:00:00.000Z',
    createdAt: '2026-08-23T01:00:00.000Z',
    customerName: 'Paolo Garcia',
    serviceName: 'Aircon Cleaning',
  }),
}));

import ProviderJobDetailScreen from '../app/provider/job/[id]';

it('Bug UX-075 — provider job directions open the real navigation workspace on browsers', async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <ProviderJobDetailScreen />
    </QueryClientProvider>,
  );

  fireEvent.click(await screen.findByLabelText('Directions and arrival'));

  expect(mockPush).toHaveBeenCalledWith('/provider/job/booking-1/navigate');
});
