import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'provider-1' }),
}));

jest.mock('@/services/provider.service', () => ({
  getProviderProfile: jest.fn().mockResolvedValue({
    id: 'provider-1', userId: 'user-1', name: 'Roberto Villanueva', tier: 'verified',
    bio: 'Licensed electrician', rating: 4.8, totalJobs: 42, acceptanceRate: 95,
    responseTimeMinutes: 20, yearsExperience: 8, serviceRadiusKm: 15, isAvailable: true,
    latitude: null, longitude: null, city: 'Cebu City', province: 'Cebu',
    createdAt: '2026-01-01T00:00:00.000Z', sukiCount: 3,
    ratings: { overall: 4.8, quality: 4.8, punctuality: 4.7, professionalism: 4.9, communication: 4.8, value: 4.7, totalReviews: 12 },
    schedule: [], portfolio: [], certifications: [],
    services: [{
      id: 'provider-service-1', providerId: 'provider-1', subcategoryId: 'service-hourly',
      subcategoryName: 'Electrical troubleshooting', categoryId: 'category-1',
      categoryName: 'Electrical', categorySlug: 'electrical',
      description: 'Includes on-site diagnosis and an explanation of the recommended repair before approval.',
      pricingType: 'hourly', hourlyRate: 70000, unitLabel: null, unitPrice: null,
      basePrice: 95000, isActive: true,
    }],
  }),
}));

jest.mock('@/services/review.service', () => ({
  getProviderReviews: jest.fn().mockResolvedValue({
    reviews: [],
    aggregate: { overall: null, quality: null, punctuality: null, professionalism: null, communication: null, value: null, totalReviews: 0 },
    total: 0,
  }),
}));

import ProviderProfileScreen from '../app/customer/provider/[id]';
import { useBookingStore } from '../src/stores/booking.store';

it('Bug UX-048 — provider profile uses the canonical hourly catalog rate when starting a booking', async () => {
  mockPush.mockClear();
  useBookingStore.getState().reset();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><ProviderProfileScreen /></QueryClientProvider>);

  expect(await screen.findByText('₱700.00/hr')).toBeTruthy();
  expect(screen.queryByText('₱950.00/hr')).toBeNull();
  fireEvent.click(
    screen.getByRole('button', {
      name: 'Start Electrical troubleshooting booking; provider assignment confirmed later',
    }),
  );

  await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/customer/booking/configure'));
  expect(useBookingStore.getState().draft).toMatchObject({
    categoryName: 'Electrical',
    subcategoryName: 'Electrical troubleshooting',
    pricingType: 'hourly',
    isHourly: true,
    hourlyRate: 70000,
    basePrice: 70000,
  });
});
