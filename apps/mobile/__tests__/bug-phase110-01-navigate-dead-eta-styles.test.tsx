import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Linking } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('@/services/booking.service', () => ({
  getBookingById: jest.fn().mockResolvedValue({
    id: 'booking-1',
    status: 'provider_en_route',
    customerName: 'Ana Cruz',
    address: '88 Banilad Road',
    barangay: 'Banilad',
    city: 'Mandaue City',
    province: 'Cebu',
    latitude: 10.3388,
    longitude: 123.9182,
  }),
}));
jest.mock('@/services/provider-api.service', () => ({ updateBookingStatus: jest.fn() }));
jest.mock('@/hooks/useLocation', () => ({
  useLocation: () => ({ getCurrentLocation: jest.fn(), isLoading: false }),
}));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'booking-1' }),
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

import NavigateToJobScreen from '../app/provider/job/[id]/navigate';

it('BUG-PHASE110-01 - provider directions render real destination actions without a fabricated ETA', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><NavigateToJobScreen /></QueryClientProvider>);

  expect(await screen.findByLabelText('Desktop job directions workspace')).toBeTruthy();
  expect(await screen.findByText('Ana Cruz')).toBeTruthy();
  expect(await screen.findByText('88 Banilad Road, Banilad, Mandaue City, Cebu')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Open directions in Google Maps' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Open directions in Waze' })).toBeTruthy();
  expect(screen.queryByText(/ETA/i)).toBeNull();

  fireEvent.click(screen.getByRole('button', { name: 'Open directions in Google Maps' }));
  await waitFor(() => expect(Linking.openURL).toHaveBeenCalledWith(
    'https://www.google.com/maps/dir/?api=1&destination=10.3388,123.9182',
  ));
});
