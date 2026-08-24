import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockPush = jest.fn();
const mockSetCategory = jest.fn();
const mockSetSubcategory = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'provider-1' }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({
    width: 1280,
    breakpoint: 'desktop',
    isPhone: false,
    isTablet: false,
    isDesktop: true,
  }),
}));
jest.mock('@/stores/booking.store', () => ({
  useBookingStore: () => ({ setCategory: mockSetCategory, setSubcategory: mockSetSubcategory }),
}));
jest.mock('@/services/provider.service', () => ({
  getProviderProfile: jest.fn().mockResolvedValue({
    id: 'provider-1',
    userId: 'user-1',
    name: 'Cebu Prime Care',
    tier: 'verified',
    bio: 'Home maintenance team.',
    rating: 4.8,
    totalJobs: 42,
    acceptanceRate: 92,
    responseTimeMinutes: 18,
    yearsExperience: 8,
    serviceRadiusKm: 20,
    isAvailable: true,
    latitude: null,
    longitude: null,
    city: 'Cebu City',
    province: 'Cebu',
    createdAt: '2026-01-01T00:00:00.000Z',
    sukiCount: 12,
    ratings: {},
    portfolio: [],
    certifications: [],
    schedule: [
      { id: 'slot-1', dayOfWeek: 1, startTime: '08:00', endTime: '17:00', isAvailable: true },
    ],
    services: [
      {
        id: 'service-1',
        providerId: 'provider-1',
        subcategoryId: 'subcategory-1',
        subcategoryName: 'Deep Cleaning',
        categoryId: 'category-1',
        categoryName: 'Cleaning',
        categorySlug: 'cleaning',
        description: 'Detailed whole-home cleaning scope.',
        pricingType: 'fixed',
        hourlyRate: null,
        unitLabel: null,
        unitPrice: null,
        basePrice: 150000,
        isActive: true,
      },
    ],
  }),
}));
jest.mock('@/services/review.service', () => ({
  getProviderReviews: jest.fn().mockResolvedValue({ reviews: [], aggregate: null }),
}));
jest.mock('@/services/suki.service', () => ({
  getMemberships: jest
    .fn()
    .mockResolvedValue([
      {
        id: 'membership-1',
        customerId: 'customer-1',
        providerId: 'provider-1',
        providerName: 'Cebu Prime Care',
        tier: 'suki',
        totalBookings: 4,
        totalSpent: 500000,
        pointsBalance: 180,
        pointsMultiplier: 1.5,
        discount: 5,
        createdAt: '2026-01-01T00:00:00.000Z',
        lastBookingAt: '2026-08-01T00:00:00.000Z',
      },
    ]),
}));

import ProviderProfileScreen from '../app/customer/provider/[id]';

it('Bug UX-310 — provider detail uses a wide relationship workspace and starts only the chosen service with truthful assignment copy', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(
    <QueryClientProvider client={client}>
      <ProviderProfileScreen />
    </QueryClientProvider>,
  );

  expect(
    await screen.findByLabelText('Tablet and desktop customer provider workspace'),
  ).toBeTruthy();
  expect(screen.getByLabelText('Your Suki relationship with this provider')).toBeTruthy();
  const service = screen.getByLabelText(
    'Start Deep Cleaning booking; provider assignment confirmed later',
  );
  expect(screen.queryByText('Book a Service')).toBeNull();
  fireEvent.click(service);

  expect(mockSetSubcategory).toHaveBeenCalledWith(
    'subcategory-1',
    'Deep Cleaning',
    150000,
    expect.objectContaining({ pricingType: 'fixed' }),
  );
  expect(mockPush).toHaveBeenCalledWith('/customer/booking/configure');
});
