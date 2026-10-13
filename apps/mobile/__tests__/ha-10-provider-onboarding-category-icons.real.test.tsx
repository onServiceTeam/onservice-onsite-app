// Human audit 2026-10-13, item HA-10 (task HA-DISC item 3): provider
// onboarding used its own copy of the old category icon map (a snowflake for
// aircon, a hammer fallback). It now draws from the same shared map as the
// customer home, so a provider and a customer see the same icon for the same
// service. (Was labelled HA-03; renamed so each ID covers one behaviour in
// one file.)
import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
}));
jest.mock('@/stores/onboarding.store', () => ({
  useOnboardingStore: () => ({
    ...jest.requireActual('@/stores/onboarding.store').useOnboardingStore.getInitialState(),
    businessName: 'Roberto Services',
    categoryIds: [],
  }),
}));
jest.mock('@/services/catalog.service', () => ({
  getCategories: jest.fn().mockResolvedValue([
    { id: 'cat-aircon', slug: 'aircon', name: 'Aircon Services' },
    { id: 'cat-cleaning', slug: 'cleaning', name: 'Cleaning' },
    { id: 'cat-roofing', slug: 'roofing', name: 'Roofing' },
  ]),
}));

import CategoriesScreen from '../app/provider-onboarding/categories';

it('HA-10: provider onboarding shows the shared job icons (AirVent, SprayCan, House) for its categories', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><CategoriesScreen /></QueryClientProvider>);

  const iconOf = (label: string): string | null | undefined =>
    screen.getByRole('checkbox', { name: label }).querySelector('[data-icon]')?.getAttribute('data-icon');
  expect(await screen.findByRole('checkbox', { name: 'Aircon Services service category' })).toBeTruthy();
  expect(iconOf('Aircon Services service category')).toBe('AirVent');
  expect(iconOf('Cleaning service category')).toBe('SprayCan');
  expect(iconOf('Roofing service category')).toBe('House');
});
