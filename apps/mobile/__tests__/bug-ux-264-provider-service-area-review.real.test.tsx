import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';

jest.mock('react-native', () => ({
  ...jest.requireActual('react-native'),
  useWindowDimensions: () => ({ width: 1024, height: 768, scale: 1, fontScale: 1 }),
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn() }),
}));

jest.mock('expo-location', () => ({
  Accuracy: { Balanced: 3 },
  requestForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
}));

jest.mock('@/lib/toast', () => ({ showToast: jest.fn() }));

const mockRequestChange = jest.fn();
jest.mock('@/services/service-area.service', () => ({
  getProviderServiceAreaState: jest.fn().mockResolvedValue({
    currentArea: {
      id: 'area-1', name: 'Mandaue', city: 'Mandaue', province: 'Cebu',
      centerLat: 10.3236, centerLng: 123.9223,
    },
    currentRadiusKm: 15,
    currentLatitude: 10.3236,
    currentLongitude: 123.9223,
    maxRadiusKm: 30,
    latestChange: {
      id: 'change-1', providerId: 'user-1', currentAreaId: 'area-1',
      requestedAreaId: 'area-2', currentRadiusKm: 15, requestedRadiusKm: 25,
      requestedLatitude: 10.3157, requestedLongitude: 123.8854,
      requestedCity: 'Cebu City', requestedProvince: 'Cebu',
      reason: 'Moved workshop', status: 'pending', decisionReason: null,
      requestedAreaName: 'Cebu City', createdAt: '2026-08-25T00:00:00.000Z',
      updatedAt: '2026-08-25T00:00:00.000Z',
    },
  }),
  getActiveServiceAreas: jest.fn().mockResolvedValue([{
    id: 'area-1', name: 'Mandaue', slug: 'mandaue', city: 'Mandaue', province: 'Cebu',
    region: 'Central Visayas', zipCodes: [], centerLat: 10.3236, centerLng: 123.9223,
    radiusKm: 15, status: 'active', launchDate: null, launchedAt: null,
    minProvidersToLaunch: 10, activeProviderCount: 5, activeCustomerCount: 8,
    totalBookings: 20, isDefault: true, createdAt: '2026-01-01', updatedAt: '2026-01-01',
  }]),
  requestProviderServiceAreaChange: (...args: unknown[]) => mockRequestChange(...args),
  cancelProviderServiceAreaChange: jest.fn(),
}));

import ProviderServiceAreaScreen from '../app/provider/service-area';

it('Bug UX-264 — provider service area renders the pending review truth and live radius cap instead of an instant-save control', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={client}>
      <ProviderServiceAreaScreen />
    </QueryClientProvider>,
  );

  expect(await screen.findByText('Pending admin review')).toBeTruthy();
  expect(view.container.querySelector('[aria-label="Tablet and desktop provider service area workspace"]')).not.toBeNull();
  expect(screen.getByText('Cebu City · 25 km')).toBeTruthy();
  expect(screen.getByText('Platform max 30 km')).toBeTruthy();
  expect(screen.getByText(/current coverage remains active until approval/i)).toBeTruthy();
  expect(screen.getByText('Review pending')).toBeTruthy();
  expect(screen.queryByText('Save')).toBeNull();
  expect(mockRequestChange).not.toHaveBeenCalled();
});
