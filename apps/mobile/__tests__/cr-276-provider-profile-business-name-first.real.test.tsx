// Customer review 2026-10-18, Service Provider profile privacy fix
// (discovery-support-4, app side; D41 Q4 pattern): the profile shows the
// business name first and the person's name under it, and reads only public
// fields.
import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'provider-1' }),
}));
jest.mock('@/hooks/useRequestFirstBooking', () => ({ useRequestFirstBooking: () => true }));
jest.mock('@/services/provider.service', () => ({
  // The public profile shape. It has no lists for schedule or portfolio here,
  // so the screen must also cope with a server that leaves a list out.
  getProviderProfile: jest.fn().mockResolvedValue({
    id: 'provider-1', businessName: 'Linis Pro Cleaning Services', name: 'Ana Reyes', avatarUrl: null,
    tier: 'new', bio: null, rating: null, totalJobs: 3, acceptanceRate: null,
    responseTimeMinutes: null, yearsExperience: null, serviceRadiusKm: null,
    city: 'Mandaue City', province: 'Cebu', sukiCount: 0, ratings: {}, services: [],
  }),
}));
jest.mock('@/services/review.service', () => ({
  getProviderReviews: jest.fn().mockResolvedValue({ reviews: [], aggregate: null, total: 0 }),
}));
jest.mock('@/services/suki.service', () => ({ getMemberships: jest.fn().mockResolvedValue([]) }));

import ProviderProfileScreen from '../app/customer/provider/[id]';

it('Bug CR-276 — the Service Provider profile shows the business name first and the person\'s name under it', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const { container } = render(<QueryClientProvider client={client}><ProviderProfileScreen /></QueryClientProvider>);

  const business = await screen.findByText('Linis Pro Cleaning Services');
  const person = screen.getByText('Ana Reyes');
  // Business name comes before the person's name in the header.
  expect(business.compareDocumentPosition(person) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  // No photo: the initials placeholder stands in, named after the business.
  expect(screen.getByLabelText("Linis Pro Cleaning Services's initials")).toBeTruthy();
  // The missing schedule and portfolio lists render as empty, not a crash.
  expect(screen.getByText(/No regular availability has been published/)).toBeTruthy();
  expect(container.textContent).not.toContain('Portfolio');
});
