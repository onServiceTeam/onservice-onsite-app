import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn() }) }));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 820, breakpoint: 'tablet', isPhone: false, isTablet: true, isDesktop: false }),
}));
jest.mock('@/services/address.service', () => ({
  getAddresses: jest.fn().mockResolvedValue([{
    id: 'address-1',
    label: 'Home',
    fullAddress: '22 Mango Avenue',
    barangay: 'Kamputhaw',
    city: 'Cebu City',
    province: 'Cebu',
    latitude: 10.3157,
    longitude: 123.8854,
    isDefault: true,
  }]),
}));
jest.mock('@/hooks/useLocation', () => ({
  useLocation: () => ({ isAvailable: true, isLoading: false, getCurrentLocation: jest.fn() }),
}));
jest.mock('@/hooks/useServiceAreaDefaults', () => ({
  useServiceAreaDefaults: () => ({
    areas: [{ id: 'cebu', name: 'Cebu City', city: 'Cebu City', province: 'Cebu', centerLat: 10.3157, centerLng: 123.8854 }],
    defaultRegion: { latitude: 10.3157, longitude: 123.8854, latitudeDelta: 0.05, longitudeDelta: 0.05 },
    isLoading: false,
  }),
}));
jest.mock('@/services/service-area.service', () => ({ checkCoverage: jest.fn() }));

import AddressPickerScreen from '../app/customer/address-picker';

it('Bug UX-376 — tablet address selection exposes controls, exact-location map, and confirmation as one wide workspace', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><AddressPickerScreen /></QueryClientProvider>);

  expect(screen.getByLabelText('Wide service address picker workspace')).toBeTruthy();
  expect(screen.getByText('Map preview')).toBeTruthy();
  expect(screen.getByLabelText('Confirm service address')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Use this device location' })).toBeTruthy();
  expect(await screen.findByRole('button', { name: 'Use saved address Home' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Search active service areas' })).toBeTruthy();
});
