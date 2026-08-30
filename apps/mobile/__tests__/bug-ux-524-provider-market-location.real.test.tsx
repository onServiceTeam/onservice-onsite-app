import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

const mockPush = jest.fn();
const mockSetServiceArea = jest.fn();
const mockPermission = jest.fn().mockResolvedValue({ status: 'granted' });
const mockPosition = jest.fn().mockResolvedValue({
  coords: { latitude: 10.32, longitude: 123.89 },
});

const mockConfiguredAreas = [
  {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Metro Cebu',
    slug: 'metro-cebu',
    city: 'Cebu City',
    province: 'Cebu',
    region: 'Central Visayas',
    zipCodes: [],
    centerLat: 10.3157,
    centerLng: 123.8854,
    radiusKm: 35,
    status: 'active',
    launchDate: null,
    launchedAt: null,
    minProvidersToLaunch: 5,
    activeProviderCount: 0,
    activeCustomerCount: 0,
    totalBookings: 0,
    isDefault: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

jest.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: mockConfiguredAreas, isLoading: false, isError: false, refetch: jest.fn() }),
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn() }),
}));

jest.mock('expo-location', () => ({
  Accuracy: { Balanced: 3 },
  requestForegroundPermissionsAsync: (...args: unknown[]) => mockPermission(...args),
  getCurrentPositionAsync: (...args: unknown[]) => mockPosition(...args),
}));

jest.mock('@/services/config.service', () => ({
  getConfig: () => ({ maxServiceRadius: 30 }),
}));

jest.mock('@/services/service-area.service', () => ({
  getProviderApplicationAreas: jest.fn(),
}));

jest.mock('@/stores/onboarding.store', () => ({
  useOnboardingStore: () => ({
    serviceAreaId: null,
    serviceRadiusKm: 10,
    latitude: null,
    longitude: null,
    setServiceArea: mockSetServiceArea,
  }),
}));

import ProviderOnboardingServiceAreaScreen from '../app/provider-onboarding/service-area';

it('Bug UX-524 — provider onboarding uses admin markets and saves the exact captured base instead of a hardcoded city center', async () => {
  render(<ProviderOnboardingServiceAreaScreen />);

  expect(screen.getByText('Metro Cebu')).toBeTruthy();
  expect(screen.queryByText('Boracay')).toBeNull();

  fireEvent.click(screen.getByLabelText('Metro Cebu, Active market'));
  fireEvent.click(screen.getByLabelText('Capture exact provider operating location'));

  expect(await screen.findByText('Exact operating location captured inside Metro Cebu.')).toBeTruthy();
  fireEvent.click(screen.getByText('Next'));

  expect(mockSetServiceArea).toHaveBeenCalledWith({
    areaId: mockConfiguredAreas[0]!.id,
    radiusKm: 10,
    lat: 10.32,
    lng: 123.89,
    city: 'Cebu City',
    province: 'Cebu',
  });
  expect(mockSetServiceArea).not.toHaveBeenCalledWith(expect.objectContaining({
    lat: mockConfiguredAreas[0]!.centerLat,
    lng: mockConfiguredAreas[0]!.centerLng,
  }));
  expect(mockPush).toHaveBeenCalledWith('/provider-onboarding/vetting');
});
