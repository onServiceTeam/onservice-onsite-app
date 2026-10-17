// Customer review 2026-10-18, Suki hidden (D41 Q33 option a), P2 fix round:
// while the server's Suki switch is off, the Service Provider profile a
// customer opens shows no Suki count badge and no "Your Suki relationship"
// card (tier and points), and it asks the Suki service for no memberships.
// The rest of the profile still shows.
import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import api from '@/services/api';

const mockGetMemberships = jest.fn().mockResolvedValue([{
  id: 'membership-1', customerId: 'customer-1', providerId: 'provider-1', providerName: 'Linis Pro Cleaning Services',
  tier: 'super_suki', totalBookings: 9, totalSpent: 900000, pointsBalance: 640, pointsMultiplier: 2, discount: 10,
  createdAt: '2026-01-01T00:00:00.000Z', lastBookingAt: '2026-09-01T00:00:00.000Z',
}]);
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'provider-1' }),
}));
jest.mock('@/hooks/useResponsive', () => ({ useResponsive: () => ({ isPhone: true, isDesktop: false }) }));
jest.mock('@/stores/booking.store', () => ({
  useBookingStore: () => ({ setCategory: jest.fn(), setSubcategory: jest.fn() }),
}));
jest.mock('@/services/provider.service', () => ({
  getProviderProfile: jest.fn().mockResolvedValue({
    id: 'provider-1', businessName: 'Linis Pro Cleaning Services', name: 'Maria Santos', avatarUrl: null,
    tier: 'verified', bio: null, rating: 4.8, totalJobs: 30, acceptanceRate: 90, responseTimeMinutes: 20,
    yearsExperience: 6, serviceRadiusKm: 12, isAvailable: true, city: 'Cebu City', province: 'Cebu',
    createdAt: '2026-01-01T00:00:00.000Z', sukiCount: 7, ratings: {}, services: [], portfolio: [],
    certifications: [], schedule: [],
  }),
}));
jest.mock('@/services/review.service', () => ({
  getProviderReviews: jest.fn().mockResolvedValue({ reviews: [], aggregate: null }),
}));
jest.mock('@/services/suki.service', () => ({
  getMemberships: (...a: unknown[]) => mockGetMemberships(...a),
}));

import ProviderProfileScreen from '../app/customer/provider/[id]';

it('Bug CR-298 — with the Suki switch off, the Service Provider profile shows no Suki badge or Suki relationship card and fetches no memberships', async () => {
  (api.get as jest.Mock).mockReset().mockResolvedValue({
    data: { success: true, data: { sukiProgramEnabled: false, referralProgramEnabled: false, requestFirstBooking: true } },
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const { container } = render(<QueryClientProvider client={client}><ProviderProfileScreen /></QueryClientProvider>);

  expect(await screen.findByText('Linis Pro Cleaning Services')).toBeTruthy();
  await waitFor(() => expect(api.get).toHaveBeenCalledWith('/api/v1/config'));
  await act(() => new Promise((resolve) => setTimeout(resolve, 30)));

  // The rest of the profile still shows.
  expect(screen.getByText('Maria Santos')).toBeTruthy();
  expect(screen.getByText('Jobs')).toBeTruthy();
  // No Suki anywhere on it.
  expect(container.textContent).not.toMatch(/Suki/);
  expect(screen.queryByLabelText('Your Suki relationship with this provider')).toBeNull();
  expect(container.textContent).not.toMatch(/640 points/);
  expect(mockGetMemberships).not.toHaveBeenCalled();
});
