import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('expo-router', () => ({ useRouter: () => ({ back: jest.fn() }) }));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 900, breakpoint: 'tablet', isPhone: false, isTablet: true, isDesktop: false }),
  byBreakpoint: (_breakpoint: string, options: { tablet: unknown }) => options.tablet,
}));
jest.mock('@/services/provider-crm.service', () => ({
  getCategoryInsights: jest.fn().mockResolvedValue([{
    categoryId: 'category-1', categoryName: 'Aircon', jobCount: 5, completedCount: 3,
    completionRate: 60, completedValue: 150000, avgRating: 4.4,
  }]),
}));

import InsightsScreen from '../app/provider/insights';

it('Bug UX-286 — provider insights defines source, scope, freshness, and completed gross value in the tablet workspace', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const view = render(<QueryClientProvider client={client}><InsightsScreen /></QueryClientProvider>);

  expect(await screen.findByText('What these numbers mean')).toBeTruthy();
  expect(view.container.querySelector('[accessibilitylabel="Tablet and desktop provider category insights workspace"]')).not.toBeNull();
  expect(screen.getByText(/grouped by the booking's catalog category/i)).toBeTruthy();
  expect(screen.getByText(/completed\/provider-completed states/i)).toBeTruthy();
  expect(screen.getByText(/visible customer reviews only/i)).toBeTruthy();
  expect(screen.getByText('completed value')).toBeTruthy();
  expect(screen.getByText(/Pull down to refresh/i)).toBeTruthy();
});
