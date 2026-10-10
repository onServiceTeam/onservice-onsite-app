import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockGetProviderJobRequest = jest.fn().mockResolvedValue({
  id: 'booking-1', categoryId: 'category-1', subcategoryId: null,
  categoryName: 'Plumbing', serviceName: 'Provider-safe sink request',
  description: 'Redacted lead detail', urgency: null, budgetMin: null, budgetMax: null,
  jobPhotos: [], jobVideoUrl: null, intakeAnswers: null, barangay: 'Lahug',
  city: 'Cebu City', province: 'Cebu', customerName: 'Customer One', distanceKm: 2,
  createdAt: '2026-09-01T00:00:00.000Z',
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

it('Bug OPS-275 — provider-safe lead detail never reuses the generic booking cache contract', async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity, gcTime: 0 } },
  });
  client.setQueryData(['booking', 'booking-1'], {
    id: 'booking-1', serviceName: 'Cached full booking', description: 'Potentially privileged detail',
  });

  render(
    <QueryClientProvider client={client}>
      <QuoteBuilderScreen />
    </QueryClientProvider>,
  );

  expect(await screen.findByText('Provider-safe sink request')).toBeTruthy();
  expect(screen.queryByText('Cached full booking')).toBeNull();
  expect(mockGetProviderJobRequest).toHaveBeenCalledWith('booking-1');
});
