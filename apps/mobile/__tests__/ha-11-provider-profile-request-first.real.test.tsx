// Human audit 2026-10-13, item HA-11 (D38, task HA-DISC item 7): the provider
// profile follows the same rule as the category screen and search. With
// request-first booking on (the default), its services show no peso price and
// every one opens the describe-your-job request. Choosing a service still does
// not assign this provider (D29). (Was labelled HA-07, which is the search
// screen; renamed so each ID covers one behaviour in one file.)
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import api from '@/services/api';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'provider-1' }),
}));
jest.mock('@/services/provider.service', () => ({
  getProviderProfile: jest.fn().mockResolvedValue({
    id: 'provider-1', userId: 'user-1', name: 'Cebu Cool Air', tier: 'verified',
    bio: 'Aircon team.', rating: 4.8, totalJobs: 42, acceptanceRate: 95,
    responseTimeMinutes: 20, yearsExperience: 8, serviceRadiusKm: 15, isAvailable: true,
    latitude: null, longitude: null, city: 'Cebu City', province: 'Cebu',
    createdAt: '2026-01-01T00:00:00.000Z', sukiCount: 0,
    ratings: {}, schedule: [], portfolio: [], certifications: [],
    services: [
      {
        id: 'ps-fixed', providerId: 'provider-1', subcategoryId: 'svc-fixed', subcategoryName: 'Aircon cleaning',
        categoryId: 'cat-aircon', categoryName: 'Aircon Services', categorySlug: 'aircon',
        description: '', pricingType: 'fixed', hourlyRate: null, unitLabel: null, unitPrice: null,
        basePrice: 95000, isActive: true,
      },
      {
        id: 'ps-hourly', providerId: 'provider-1', subcategoryId: 'svc-hourly', subcategoryName: 'Aircon troubleshooting',
        categoryId: 'cat-aircon', categoryName: 'Aircon Services', categorySlug: 'aircon',
        description: 'Diagnosis of a unit that does not cool.', pricingType: 'hourly', hourlyRate: 70000,
        unitLabel: null, unitPrice: null, basePrice: null, isActive: true,
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

beforeEach(() => {
  mockPush.mockClear();
  useBookingStore.getState().reset();
  (api.get as jest.Mock).mockReset().mockResolvedValue({ data: { success: true, data: { requestFirstBooking: true } } });
});

async function renderProfile(): Promise<HTMLElement> {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const { container } = render(<QueryClientProvider client={client}><ProviderProfileScreen /></QueryClientProvider>);
  expect(await screen.findByText('Services Offered')).toBeTruthy();
  await waitFor(() => expect(api.get).toHaveBeenCalledWith('/api/v1/config'));
  await act(() => new Promise((resolve) => setTimeout(resolve, 20)));
  return container;
}

it('HA-11: provider profile services show no peso price when request-first booking is on', async () => {
  const container = await renderProfile();

  const services = screen.getByText('Services Offered').parentElement!;
  expect(services.textContent).toContain('Aircon cleaning');
  expect(services.textContent).not.toMatch(/₱/);
  expect(container.textContent).not.toContain('₱950.00');
  expect(container.textContent).not.toContain('₱700.00/hr');
  expect(screen.queryByText('Get Quote')).toBeNull();
});

it('HA-11: tapping a provider profile service opens the describe-your-job request when request-first booking is on', async () => {
  await renderProfile();

  fireEvent.click(screen.getByRole('button', {
    name: 'Start Aircon cleaning booking; provider assignment confirmed later',
  }));

  expect(mockPush).toHaveBeenCalledWith('/customer/booking/job-request');
  expect(useBookingStore.getState().draft).toMatchObject({
    categoryName: 'Aircon Services',
    subcategoryName: 'Aircon cleaning',
    pricingType: 'fixed',
    basePrice: 0,
  });
});
