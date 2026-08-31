import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn() }) }));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1100, breakpoint: 'desktop', isPhone: false, isTablet: false, isDesktop: true }),
}));
jest.mock('@/services/address.service', () => ({ getAddresses: jest.fn().mockResolvedValue([]) }));
jest.mock('@/hooks/useLocation', () => ({
  useLocation: () => ({ isAvailable: true, isLoading: false, getCurrentLocation: jest.fn() }),
}));
jest.mock('@/hooks/useServiceAreaDefaults', () => ({
  useServiceAreaDefaults: () => ({
    areas: [],
    defaultRegion: { latitude: 10.3157, longitude: 123.8854, latitudeDelta: 0.05, longitudeDelta: 0.05 },
    isLoading: false,
    isError: true,
    refetch: jest.fn(),
  }),
}));
jest.mock('@/services/service-area.service', () => ({ checkCoverage: jest.fn() }));

import AddressPickerScreen from '../app/customer/address-picker';

it('Bug UX-616 — address actions stay unavailable when active service-area truth cannot be loaded', () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><AddressPickerScreen /></QueryClientProvider>);

  expect(screen.getByText(/Address selection is paused/i)).toBeTruthy();
  expect((screen.getByRole('button', { name: 'Search active service areas' }) as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByRole('button', { name: 'Use this device location' }) as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByRole('button', { name: 'Confirm Address' }) as HTMLButtonElement).disabled).toBe(true);
});
