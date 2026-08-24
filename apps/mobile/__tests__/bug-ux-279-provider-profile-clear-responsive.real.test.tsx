import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockUpdateMyProfile = jest.fn().mockResolvedValue({});

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn() }) }));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1280, breakpoint: 'desktop', isPhone: false, isTablet: false, isDesktop: true }),
}));
jest.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({
    user: { firstName: 'Juan', lastName: 'Provider', phone: '+639171234567' }, logout: jest.fn(),
  }),
}));
jest.mock('@/services/provider-api.service', () => ({
  getMyProfile: jest.fn().mockResolvedValue({
    id: 'provider-1', tier: 'verified', bio: 'Old bio', yearsExperience: 8,
    serviceRadiusKm: 15, rating: 4.8, totalJobs: 12, services: [], schedule: [],
  }),
  updateMyProfile: (...args: unknown[]) => mockUpdateMyProfile(...args),
}));

import ProviderProfileScreen from '../app/(provider-tabs)/provider-profile';

it('Bug UX-279 — provider can clear optional profile fields from the bounded desktop profile workspace', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><ProviderProfileScreen /></QueryClientProvider>);

  expect(await screen.findByLabelText('Tablet and desktop provider profile workspace')).toBeTruthy();
  fireEvent.click(screen.getByText('Edit'));
  fireEvent.change(screen.getByLabelText('Bio'), { target: { value: '' } });
  fireEvent.change(screen.getByLabelText('Years of Experience'), { target: { value: '' } });
  fireEvent.click(screen.getByText('Save'));

  await waitFor(() => expect(mockUpdateMyProfile).toHaveBeenCalledWith({ bio: '', yearsExperience: null }));
});
