import React from 'react';
import { render, screen } from '@testing-library/react';

const mockArea = {
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
  useQuery: ({ queryKey }: { queryKey: string[] }) => queryKey[0] === 'categories'
    ? {
        data: [{ id: 'category-1', name: 'Cleaning', slug: 'cleaning' }],
        isLoading: false,
        isError: false,
        refetch: jest.fn(),
      }
    : { data: [mockArea], isLoading: false, isError: false, refetch: jest.fn() },
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
}));

jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ isPhone: false, isTablet: false }),
}));

jest.mock('@/services/catalog.service', () => ({ getCategories: jest.fn() }));
jest.mock('@/services/service-area.service', () => ({ getProviderApplicationAreas: jest.fn() }));
jest.mock('@/services/config.service', () => ({ getConfig: () => ({ maxServiceRadius: 30 }) }));

jest.mock('@/stores/onboarding.store', () => ({
  useOnboardingStore: () => ({
    ...jest.requireActual('@/stores/onboarding.store').useOnboardingStore.getInitialState(),
    businessName: '',
    categoryIds: [],
    setBusinessName: jest.fn(),
    setCategories: jest.fn(),
    serviceAreaId: null,
    serviceRadiusKm: 10,
    latitude: null,
    longitude: null,
    setServiceArea: jest.fn(),
  }),
}));

import ProviderCategoriesScreen from '../app/provider-onboarding/categories';
import ProviderServiceAreaScreen from '../app/provider-onboarding/service-area';

it('Bug PHASE149-01 — provider onboarding bounds editable names and no longer accepts free-form city or province values', () => {
  const categoriesView = render(<ProviderCategoriesScreen />);
  const businessName = screen.getByLabelText('Business / Professional Name') as HTMLInputElement;
  expect(businessName.maxLength).toBe(200);
  categoriesView.unmount();

  render(<ProviderServiceAreaScreen />);
  expect(screen.getByText('Metro Cebu')).toBeTruthy();
  expect(screen.queryByLabelText('City')).toBeNull();
  expect(screen.queryByLabelText('Province')).toBeNull();
});
