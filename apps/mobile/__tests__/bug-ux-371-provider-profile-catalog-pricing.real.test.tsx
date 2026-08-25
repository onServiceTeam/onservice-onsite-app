import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 820, isPhone: false, isTablet: true, isDesktop: false }),
}));
jest.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({
    user: { firstName: 'Juan', lastName: 'Provider', phone: '+639171234567' },
    logout: jest.fn(),
  }),
}));
jest.mock('@/services/provider-api.service', () => ({
  getMyProfile: jest.fn().mockResolvedValue({
    id: 'provider-1',
    tier: 'verified',
    bio: 'Aircon specialist',
    yearsExperience: 8,
    serviceRadiusKm: 15,
    rating: 4.8,
    totalJobs: 12,
    services: [
      {
        id: 'service-hourly',
        subcategoryName: 'Emergency plumbing',
        pricingType: 'hourly',
        basePrice: null,
        hourlyRate: 85_000,
      },
      {
        id: 'service-quote',
        subcategoryName: 'Renovation assessment',
        pricingType: 'quote',
        basePrice: null,
      },
    ],
    schedule: [],
  }),
  updateMyProfile: jest.fn(),
}));

import ProviderProfileScreen from '../app/(provider-tabs)/provider-profile';

it('Bug UX-371 — provider profile shows every live catalog pricing model instead of hiding non-fixed prices', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(
    <QueryClientProvider client={client}>
      <ProviderProfileScreen />
    </QueryClientProvider>,
  );

  expect(await screen.findByText('Emergency plumbing')).toBeTruthy();
  expect(screen.getByText(/Customer price.*850.*hour/i)).toBeTruthy();
  expect(screen.getByText('Renovation assessment')).toBeTruthy();
  expect(screen.getByText('Quote after assessment')).toBeTruthy();
});
