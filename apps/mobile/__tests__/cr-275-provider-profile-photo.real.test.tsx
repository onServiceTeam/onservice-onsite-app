// Customer review 2026-10-18, Service Provider profile privacy fix
// (discovery-support-4, app side): the profile header shows the Service
// Provider's photo when the public profile carries one.
import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// The shared react-native stub writes an image's source object as the text
// "[object Object]"; this test keeps its address readable as data-uri.
jest.mock('react-native', () => {
  const ReactModule = jest.requireActual('react') as typeof React;
  const stub = jest.requireActual('../__mocks__/react-native.js');
  return {
    ...stub,
    Image: ({ source, ...rest }: { source?: { uri?: string } }) =>
      ReactModule.createElement(stub.Image, { ...rest, 'data-uri': source?.uri }),
  };
});
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'provider-1' }),
}));
jest.mock('@/hooks/useRequestFirstBooking', () => ({ useRequestFirstBooking: () => true }));
jest.mock('@/services/provider.service', () => ({
  // The public profile shape: no map location, no account status, no account id.
  getProviderProfile: jest.fn().mockResolvedValue({
    id: 'provider-1', businessName: "Kuya Mike's Plumbing", name: 'Miguel Reyes',
    avatarUrl: 'https://cdn.example.test/avatars/provider-1.jpg',
    tier: 'new', bio: null, rating: null, totalJobs: 0, acceptanceRate: null,
    responseTimeMinutes: null, yearsExperience: null, serviceRadiusKm: null,
    city: 'Cebu City', province: 'Cebu', sukiCount: 0,
    ratings: {}, schedule: [], portfolio: [], certifications: [], services: [],
  }),
}));
jest.mock('@/services/review.service', () => ({
  getProviderReviews: jest.fn().mockResolvedValue({ reviews: [], aggregate: null, total: 0 }),
}));
jest.mock('@/services/suki.service', () => ({ getMemberships: jest.fn().mockResolvedValue([]) }));

import ProviderProfileScreen from '../app/customer/provider/[id]';

it('Bug CR-275 — the Service Provider profile header shows the photo when the profile has one', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><ProviderProfileScreen /></QueryClientProvider>);

  const photo = await screen.findByLabelText("Kuya Mike's Plumbing's profile picture");
  expect(photo.tagName.toLowerCase()).toBe('rn-image');
  expect(photo.getAttribute('data-uri')).toBe('https://cdn.example.test/avatars/provider-1.jpg');
  // The initials placeholder is not shown when there is a photo.
  expect(screen.queryByLabelText("Kuya Mike's Plumbing's initials")).toBeNull();
});
