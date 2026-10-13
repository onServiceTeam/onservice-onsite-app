// Human audit 2026-10-13, item HA-12 (D38, task HA-DISC item 7, "when off,
// today's behaviour"): the fixed-price provider-profile flow stays in the code
// behind the admin setting request_first_booking. Bug UX-310 used to be the
// only test of this branch; it now pins the request-first default, so this
// file keeps the fixed-price branch covered. With requestFirstBooking false a
// fixed-price service shows its price and carries its base price into the
// configure screen.
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import api from '@/services/api';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'provider-1' }),
}));
jest.mock('@/services/provider.service', () => ({
  getProviderProfile: jest.fn().mockResolvedValue({
    id: 'provider-1', userId: 'user-1', name: 'Cebu Prime Care', tier: 'verified',
    bio: 'Home maintenance team.', rating: 4.8, totalJobs: 42, acceptanceRate: 92,
    responseTimeMinutes: 18, yearsExperience: 8, serviceRadiusKm: 20, isAvailable: true,
    latitude: null, longitude: null, city: 'Cebu City', province: 'Cebu',
    createdAt: '2026-01-01T00:00:00.000Z', sukiCount: 0,
    ratings: {}, schedule: [], portfolio: [], certifications: [],
    services: [
      {
        id: 'service-1', providerId: 'provider-1', subcategoryId: 'subcategory-1', subcategoryName: 'Deep Cleaning',
        categoryId: 'category-1', categoryName: 'Cleaning', categorySlug: 'cleaning',
        description: 'Detailed whole-home cleaning scope.', pricingType: 'fixed', hourlyRate: null,
        unitLabel: null, unitPrice: null, basePrice: 150000, isActive: true,
      },
    ],
  }),
}));
jest.mock('@/services/review.service', () => ({
  getProviderReviews: jest.fn().mockResolvedValue({ reviews: [], aggregate: null, total: 0 }),
}));
jest.mock('@/services/suki.service', () => ({ getMemberships: jest.fn().mockResolvedValue([]) }));

import ProviderProfileScreen from '../app/customer/provider/[id]';
import { useBookingStore } from '../src/stores/booking.store';

it('HA-12: with requestFirstBooking false, a fixed-price provider service shows its price and carries the base price to the configure screen', async () => {
  mockPush.mockClear();
  useBookingStore.getState().reset();
  (api.get as jest.Mock).mockReset().mockImplementation(async (url: string) => {
    if (url === '/api/v1/config') return { data: { success: true, data: { requestFirstBooking: false } } };
    return { data: { success: true, data: [] } };
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><ProviderProfileScreen /></QueryClientProvider>);

  // The price only renders once the config has switched request-first off.
  expect(await screen.findByText('₱1,500.00')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', {
    name: 'Start Deep Cleaning booking; provider assignment confirmed later',
  }));

  expect(mockPush).toHaveBeenCalledTimes(1);
  expect(mockPush).toHaveBeenCalledWith('/customer/booking/configure');
  expect(useBookingStore.getState().draft).toMatchObject({
    categoryId: 'category-1',
    categoryName: 'Cleaning',
    subcategoryId: 'subcategory-1',
    subcategoryName: 'Deep Cleaning',
    pricingType: 'fixed',
    basePrice: 150000,
  });
});
