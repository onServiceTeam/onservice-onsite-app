import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import api from '@/services/api';

const mockGetMemberships = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'provider-1' }),
}));
jest.mock('@/stores/booking.store', () => ({
  useBookingStore: () => ({ setCategory: jest.fn(), setSubcategory: jest.fn() }),
}));
jest.mock('@/services/provider.service', () => ({
  getProviderProfile: jest.fn().mockResolvedValue({
    id: 'provider-1', userId: 'user-1', name: 'Cebu Prime Care', tier: 'verified', bio: null,
    rating: 4.8, totalJobs: 12, acceptanceRate: 90, responseTimeMinutes: 20, yearsExperience: 5,
    serviceRadiusKm: 15, isAvailable: true, latitude: null, longitude: null, city: 'Cebu City',
    province: 'Cebu', createdAt: '2026-01-01T00:00:00.000Z', sukiCount: 2, ratings: {},
    portfolio: [], certifications: [], schedule: [], services: [],
  }),
}));
jest.mock('@/services/review.service', () => ({
  getProviderReviews: jest.fn().mockResolvedValue({ reviews: [], aggregate: null }),
}));
jest.mock('@/services/suki.service', () => ({
  getMemberships: (...args: unknown[]) => mockGetMemberships(...args),
}));

import ProviderProfileScreen from '../app/customer/provider/[id]';

it('Bug UX-644 — a failed Suki lookup does not falsely look like the customer has no provider relationship', async () => {
  // D41 Q33 (customer review P2): the profile looks up Suki memberships only
  // while the server's Suki switch is on (it is off by default), so the server
  // here says Suki is on.
  (api.get as jest.Mock).mockReset().mockResolvedValue({ data: { success: true, data: { sukiProgramEnabled: true } } });
  mockGetMemberships.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce([]);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><ProviderProfileScreen /></QueryClientProvider>);

  expect(await screen.findByText(/does not mean you have no history with this provider/i)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Retry provider Suki relationship' }));

  await waitFor(() => expect(mockGetMemberships).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(screen.queryByText(/does not mean you have no history with this provider/i)).toBeNull());
});
