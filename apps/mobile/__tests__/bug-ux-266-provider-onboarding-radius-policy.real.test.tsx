import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useOnboardingStore } from '@/stores/onboarding.store';
import { readyApplication, mockDraftSaves } from '../test-support/application-draft-fixture';

jest.mock('react-native', () => ({
  ...jest.requireActual('react-native'),
  useWindowDimensions: () => ({ width: 1024, height: 768, scale: 1, fontScale: 1 }),
}));

const mockPush = jest.fn();

const mockCebuArea = {
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
};

jest.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: [mockCebuArea], isLoading: false, isError: false, refetch: jest.fn() }),
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn() }),
}));

jest.mock('expo-location', () => ({
  Accuracy: { Balanced: 3 },
  requestForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
  reverseGeocodeAsync: jest.fn(),
}));

jest.mock('@/services/config.service', () => ({
  getConfig: () => ({ maxServiceRadius: 30 }),
}));


jest.mock('@/services/service-area.service', () => ({
  getProviderApplicationAreas: jest.fn(),
}));

import ProviderOnboardingServiceAreaScreen from '../app/provider-onboarding/service-area';

it('Bug UX-266 — provider onboarding uses a bounded wide workspace and submits no radius above the live platform maximum', async () => {
  readyApplication();
  useOnboardingStore.setState({ serviceAreaId: mockCebuArea.id, serviceRadiusKm: 50, city: 'Cebu City', province: 'Cebu', latitude: 10.3157, longitude: 123.8854 });
  mockDraftSaves();
  const view = render(<ProviderOnboardingServiceAreaScreen />);

  expect(view.container.querySelector('[aria-label="Tablet and desktop provider onboarding service area workspace"]')).not.toBeNull();
  expect(screen.getByText(/Current platform maximum: 30 km/)).toBeTruthy();
  expect(screen.queryByText(/^40 km$/)).toBeNull();
  expect(screen.queryByText(/^50 km$/)).toBeNull();

  fireEvent.click(screen.getByRole('button', { name: 'Save & continue' }));
  await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/provider-onboarding/vetting'));
  expect(useOnboardingStore.getState()).toMatchObject({ serviceAreaId: mockCebuArea.id, serviceRadiusKm: 30 });
  expect(mockPush).toHaveBeenCalledWith('/provider-onboarding/vetting');
});
