import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Platform } from 'react-native';

jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn() }) }));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 820, breakpoint: 'tablet', isPhone: false, isTablet: true, isDesktop: false }),
}));
jest.mock('@/services/address.service', () => ({ getAddresses: jest.fn().mockResolvedValue([]) }));
jest.mock('@/hooks/useLocation', () => ({
  useLocation: () => ({ isAvailable: false, isLoading: false, getCurrentLocation: jest.fn() }),
}));
jest.mock('@/hooks/useServiceAreaDefaults', () => ({
  useServiceAreaDefaults: () => ({
    areas: [{ id: 'cebu', name: 'Cebu City', city: 'Cebu City', province: 'Cebu', centerLat: 10.3157, centerLng: 123.8854 }],
    defaultRegion: { latitude: 10.3157, longitude: 123.8854, latitudeDelta: 0.05, longitudeDelta: 0.05 },
    isLoading: false, isError: false, refetch: jest.fn(),
  }),
}));
jest.mock('@/services/service-area.service', () => ({ checkCoverage: jest.fn() }));

import AddressPickerScreen from '../app/customer/address-picker';

afterEach(() => {
  Platform.OS = 'ios';
});

it('Bug UX-1287 - the browser address workspace can set exact customer booking coordinates without using an area center', () => {
  Platform.OS = 'web';
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><AddressPickerScreen /></QueryClientProvider>);

  fireEvent.input(screen.getByLabelText('Exact latitude'), { target: { value: '10.3157' } });
  fireEvent.input(screen.getByLabelText('Exact longitude'), { target: { value: '123.8854' } });
  fireEvent.click(screen.getByRole('button', { name: 'Use exact coordinates' }));

  expect(screen.getByLabelText('Map marker')).toBeTruthy();
  expect(screen.getByText(/Exact coordinates entered/)).toBeTruthy();
  fireEvent.input(screen.getByLabelText('Barangay'), { target: { value: 'Lahug' } });

  expect((screen.getByRole('button', { name: 'Confirm Address' }) as HTMLButtonElement).disabled).toBe(false);
});
