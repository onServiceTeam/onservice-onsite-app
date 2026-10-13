import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn(), push: jest.fn() }), useLocalSearchParams: () => ({ id: 'cleaning' }) }));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1280, breakpoint: 'desktop', isPhone: false, isTablet: false, isDesktop: true }),
  byBreakpoint: (_breakpoint: string, values: { desktop: number }) => values.desktop,
}));
jest.mock('@/services/catalog.service', () => ({
  getSubcategories: jest.fn().mockResolvedValue({
    categoryName: 'Cleaning',
    subcategories: [{ id: 'service-1', categoryId: 'category-1', categoryName: 'Cleaning', categorySlug: 'cleaning', name: 'Deep Cleaning', description: 'Whole-home deep cleaning scope with rooms and exclusions.', pricingType: 'fixed', basePrice: 150000, estimatedDurationMinutes: 180 }],
  }),
}));

import SubcategoryListScreen from '../app/customer/category/[id]';

it('Bug UX-391 — the customer service catalog uses a bounded wide grid with named service and back controls', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><SubcategoryListScreen /></QueryClientProvider>);

  expect(await screen.findByLabelText('Tablet and desktop service catalog')).toBeTruthy();
  // Human audit 2026-10-13 (D38 request-first booking, the default): a row
  // now opens the describe-your-job request, so its accessible name says so.
  expect(screen.getByRole('button', { name: 'Choose Deep Cleaning and describe your job' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Go back from services' })).toBeTruthy();
});
