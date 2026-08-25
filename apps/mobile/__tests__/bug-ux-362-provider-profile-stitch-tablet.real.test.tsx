import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({
    width: 820,
    breakpoint: 'tablet',
    isPhone: false,
    isTablet: true,
    isDesktop: false,
  }),
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
    bio: 'Aircon and appliance specialist',
    yearsExperience: 8,
    serviceRadiusKm: 15,
    rating: 4.8,
    totalJobs: 12,
    services: [],
    schedule: [],
  }),
  updateMyProfile: jest.fn(),
}));

import ProviderProfileScreen from '../app/(provider-tabs)/provider-profile';

it('Bug UX-362 — tablet provider profile separates customer-facing identity from business tools and explains private account contact data', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });

  render(
    <QueryClientProvider client={client}>
      <ProviderProfileScreen />
    </QueryClientProvider>,
  );

  expect(await screen.findByLabelText('Wide provider customer-facing profile column')).toBeTruthy();
  expect(screen.getByLabelText('Wide provider business tools column')).toBeTruthy();
  expect(screen.getByText(/details customers use to understand your experience, services, and availability/i)).toBeTruthy();
  expect(screen.getByText(/not shown as a public contact action/i)).toBeTruthy();
  expect(screen.getByLabelText('Provider business tools')).toBeTruthy();
});
