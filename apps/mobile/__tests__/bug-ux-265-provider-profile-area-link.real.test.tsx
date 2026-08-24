import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn() }),
}));

jest.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({
    user: { firstName: 'Juan', lastName: 'Provider', phone: '+639171234567' },
    logout: jest.fn(),
  }),
}));

jest.mock('@/services/provider-api.service', () => ({
  getMyProfile: jest.fn().mockResolvedValue({
    id: 'provider-1', userId: 'user-1', businessName: 'Juan Services', tier: 'verified',
    status: 'approved', bio: 'Home services', rating: 4.8, totalJobs: 12,
    acceptanceRate: 90, responseTimeMinutes: 4, yearsExperience: 5,
    serviceRadiusKm: 15, isAvailable: true, latitude: 10.3236, longitude: 123.9223,
    city: 'Mandaue', province: 'Cebu', createdAt: '2026-01-01T00:00:00.000Z',
    services: [], schedule: [], ratings: { overall: 4.8, totalReviews: 10 },
    portfolio: [], certifications: [],
  }),
  updateMyProfile: jest.fn(),
}));

import ProviderProfileScreen from '../app/(provider-tabs)/provider-profile';

it('Bug UX-265 — provider profile routes service-radius changes to the reviewed service-area workflow instead of general profile editing', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ProviderProfileScreen />
    </QueryClientProvider>,
  );

  expect(await screen.findByText('Service Radius')).toBeTruthy();
  fireEvent.click(screen.getByText('15 km · Manage'));
  expect(mockPush).toHaveBeenCalledWith('/provider/service-area');

  fireEvent.click(screen.getByText('Edit'));
  expect(screen.queryByLabelText('Service Radius')).toBeNull();
});
