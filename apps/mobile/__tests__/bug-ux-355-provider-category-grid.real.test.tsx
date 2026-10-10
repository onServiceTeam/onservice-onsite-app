import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1100, breakpoint: 'desktop', isPhone: false, isTablet: false, isDesktop: true }),
}));
jest.mock('@/stores/onboarding.store', () => ({
  useOnboardingStore: () => ({
    ...jest.requireActual('@/stores/onboarding.store').useOnboardingStore.getInitialState(),
    businessName: 'Roberto Services',
    categoryIds: [],
    setBusinessName: jest.fn(),
    setCategories: jest.fn(),
  }),
}));
jest.mock('@/services/catalog.service', () => ({
  getCategories: jest.fn().mockResolvedValue([
    { id: 'cleaning', slug: 'cleaning', name: 'Cleaning' },
    { id: 'plumbing', slug: 'plumbing', name: 'Plumbing' },
    { id: 'electrical', slug: 'electrical', name: 'Electrical' },
    { id: 'aircon', slug: 'aircon', name: 'Aircon' },
  ]),
}));

import CategoriesScreen from '../app/provider-onboarding/categories';

it('Bug UX-355 — provider category onboarding renders a four-column desktop workspace with accessible selectable services', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(
    <QueryClientProvider client={client}>
      <CategoriesScreen />
    </QueryClientProvider>,
  );

  await waitFor(() => expect(screen.getByLabelText('4-column service category grid')).toBeTruthy());
  expect(screen.getByLabelText('Tablet and desktop provider category selection workspace')).toBeTruthy();
  const plumbing = screen.getByRole('checkbox', { name: 'Plumbing service category' });
  expect(plumbing.getAttribute('aria-checked')).toBe('false');
  fireEvent.click(plumbing);
  expect(screen.getByRole('checkbox', { name: 'Plumbing service category' }).getAttribute('aria-checked')).toBe('true');
});
