import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'provider-quote' }),
}));

jest.mock('@/services/provider.service', () => ({
  getProviderProfile: jest.fn().mockResolvedValue({
    id: 'provider-quote', userId: 'user-quote', name: 'Quote Provider', tier: 'verified',
    bio: 'Quote-based services', rating: 4.5, totalJobs: 20, acceptanceRate: 90,
    responseTimeMinutes: 30, yearsExperience: 5, serviceRadiusKm: 10, isAvailable: true,
    latitude: null, longitude: null, city: 'Cebu City', province: 'Cebu',
    createdAt: '2026-01-01T00:00:00.000Z', sukiCount: 0,
    ratings: { overall: 4.5, quality: 4.5, punctuality: 4.5, professionalism: 4.5, communication: 4.5, value: 4.5, totalReviews: 4 },
    schedule: [], portfolio: [], certifications: [],
    services: [{
      id: 'provider-service-quote', providerId: 'provider-quote', subcategoryId: 'service-quote',
      subcategoryName: 'Septic Tank Service', categoryId: 'category-quote',
      categoryName: 'Plumbing', categorySlug: 'plumbing', description: '',
      pricingType: 'quote', hourlyRate: null, unitLabel: null, unitPrice: null,
      basePrice: 475000, isActive: true,
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

it('Bug UX-049 — quote services never present a legacy provider base price as the booking price', async () => {
  mockPush.mockClear();
  useBookingStore.getState().reset();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><ProviderProfileScreen /></QueryClientProvider>);

  expect(await screen.findByText('Get Quote')).toBeTruthy();
  expect(screen.queryByText('₱4,750.00')).toBeNull();
  fireEvent.click(
    screen.getByRole('button', {
      name: 'Start Septic Tank Service booking; provider assignment confirmed later',
    }),
  );

  await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/customer/booking/job-request'));
  expect(useBookingStore.getState().draft).toMatchObject({
    subcategoryName: 'Septic Tank Service',
    pricingType: 'quote',
    serviceDescription: '',
    basePrice: 0,
  });
});
