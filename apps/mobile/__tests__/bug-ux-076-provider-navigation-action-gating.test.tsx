import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'booking-without-location' }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1280, isPhone: false, isTablet: false, isDesktop: true }),
}));
jest.mock('@/hooks/useLocation', () => ({
  useLocation: () => ({ getCurrentLocation: jest.fn(), isLoading: false }),
}));
jest.mock('@/services/provider-api.service', () => ({
  updateBookingStatus: jest.fn(),
}));
jest.mock('@/services/booking.service', () => ({
  getBookingById: jest.fn().mockResolvedValue({
    id: 'booking-without-location',
    status: 'provider_en_route',
    address: '',
    barangay: '',
    city: '',
    province: '',
    latitude: null,
    longitude: null,
    customerName: 'Paolo Garcia',
    categoryName: 'Aircon Services',
  }),
}));

import NavigateToJobScreen from '../app/provider/job/[id]/navigate';

it('Bug UX-076 — navigation actions stay unavailable until the booking has a usable destination', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(
    <QueryClientProvider client={client}>
      <NavigateToJobScreen />
    </QueryClientProvider>,
  );

  expect(await screen.findByLabelText('Missing job destination')).toBeTruthy();
  expect(screen.queryByLabelText('Open directions in Google Maps')).toBeNull();
  expect(screen.queryByLabelText('Open directions in Waze')).toBeNull();
  expect((screen.getByLabelText('Mark arrived at job') as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByLabelText('Desktop job directions workspace')).toBeTruthy();
});
