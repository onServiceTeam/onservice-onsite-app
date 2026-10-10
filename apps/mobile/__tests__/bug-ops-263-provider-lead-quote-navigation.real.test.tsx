import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockGetProviderJobRequest = jest.fn().mockResolvedValue({
  id: 'booking-1', categoryId: 'category-1', subcategoryId: null,
  categoryName: 'Plumbing', serviceName: 'Sink repair', description: 'Repair the leaking sink drain',
  urgency: 'same_day', budgetMin: 50000, budgetMax: 150000,
  jobPhotos: ['job/photo.jpg'], jobVideoUrl: null, intakeAnswers: { sink_type: 'Double bowl' },
  barangay: 'Lahug', city: 'Cebu City', province: 'Cebu', customerName: 'Customer One',
  distanceKm: 3.5, createdAt: '2026-09-01T00:00:00.000Z',
});

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'booking-1' }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1280, breakpoint: 'desktop', isPhone: false, isTablet: false, isDesktop: true }),
}));
jest.mock('@/services/booking.service', () => ({
  getProviderJobRequest: (...args: unknown[]) => mockGetProviderJobRequest(...args),
  submitQuote: jest.fn(),
}));
jest.mock('@/services/provider-crm.service', () => ({ listTemplates: jest.fn().mockResolvedValue([]) }));
jest.mock('@/services/api', () => ({
  __esModule: true,
  default: { get: jest.fn().mockResolvedValue({ data: { data: { tier: 'new', commissionRate: 0.15 } } }) },
}));

import QuoteBuilderScreen from '../app/provider/job/[id]/quote';

it('Bug OPS-263 — quote workspace loads the provider-safe lead detail contract instead of the assigned-booking contract', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(
    <QueryClientProvider client={client}>
      <QuoteBuilderScreen />
    </QueryClientProvider>,
  );

  expect(await screen.findByText('Sink repair')).toBeTruthy();
  expect(screen.getByText('Repair the leaking sink drain')).toBeTruthy();
  expect(screen.getByText('Double bowl')).toBeTruthy();
  expect(mockGetProviderJobRequest).toHaveBeenCalledWith('booking-1');
});
