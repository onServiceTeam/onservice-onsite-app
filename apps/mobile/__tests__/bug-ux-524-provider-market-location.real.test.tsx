import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import api from '@/services/api';
import { useOnboardingStore } from '@/stores/onboarding.store';
import { readyApplication, mockDraftSaves } from '../test-support/application-draft-fixture';

const mockPush = jest.fn();
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


import ProviderOnboardingServiceAreaScreen from '../app/provider-onboarding/service-area';

it('Bug UX-524 — provider onboarding uses admin markets and saves the exact captured base instead of a hardcoded city center', async () => {
  readyApplication();
  mockDraftSaves();
  render(<ProviderOnboardingServiceAreaScreen />);

  expect(screen.getByText('Metro Cebu')).toBeTruthy();
  expect(screen.queryByText('Boracay')).toBeNull();

  fireEvent.click(screen.getByLabelText('Metro Cebu, Active market'));
  fireEvent.click(screen.getByLabelText('Capture exact provider operating location'));

  expect(await screen.findByText('Exact operating location captured inside Metro Cebu.')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Save & continue' }));
  await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/provider-onboarding/vetting'));
  expect(useOnboardingStore.getState()).toMatchObject({
    serviceAreaId: mockConfiguredAreas[0]!.id,
    serviceRadiusKm: 10,
    latitude: 10.32,
    longitude: 123.89,
    city: 'Cebu City',
    province: 'Cebu',
  });
  expect(api.put).toHaveBeenCalledWith('/api/v1/providers/application-draft', expect.objectContaining({ fields: expect.objectContaining({ latitude: 10.32, longitude: 123.89 }) }));
  expect(useOnboardingStore.getState().latitude).not.toBe(mockConfiguredAreas[0]!.centerLat);
  expect(mockPush).toHaveBeenCalledWith('/provider-onboarding/vetting');
});
