import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

jest.mock('react-native', () => ({
  ...jest.requireActual('react-native'),
  useWindowDimensions: () => ({ width: 1024, height: 768, scale: 1, fontScale: 1 }),
}));

const mockPush = jest.fn();
const mockSetServiceArea = jest.fn();

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

jest.mock('@/stores/onboarding.store', () => ({
  useOnboardingStore: () => ({
    serviceRadiusKm: 50,
    city: 'Cebu City',
    province: 'Cebu',
    latitude: 10.3157,
    longitude: 123.8854,
    setServiceArea: mockSetServiceArea,
  }),
}));

import ProviderOnboardingServiceAreaScreen from '../app/provider-onboarding/service-area';

it('Bug UX-266 — provider onboarding uses a bounded wide workspace and submits no radius above the live platform maximum', () => {
  const view = render(<ProviderOnboardingServiceAreaScreen />);

  expect(view.container.querySelector('[aria-label="Tablet and desktop provider onboarding service area workspace"]')).not.toBeNull();
  expect(screen.getByText(/Current platform maximum: 30 km/)).toBeTruthy();
  expect(screen.queryByText(/^40 km$/)).toBeNull();
  expect(screen.queryByText(/^50 km$/)).toBeNull();

  fireEvent.click(screen.getByText('Next'));
  expect(mockSetServiceArea).toHaveBeenCalledWith(expect.objectContaining({ radiusKm: 30 }));
  expect(mockPush).toHaveBeenCalledWith('/provider-onboarding/vetting');
});
