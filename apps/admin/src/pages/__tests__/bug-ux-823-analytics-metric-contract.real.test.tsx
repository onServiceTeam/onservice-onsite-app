import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const apiGet = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', () => ({
  default: { get: apiGet, post: vi.fn(), patch: vi.fn() },
  getErrorMessage: (error: unknown) => error instanceof Error ? error.message : 'Request failed',
}));
vi.mock('@/hooks/useFeatureFlags', () => ({ useFeatureFlags: () => ({ abTestingEnabled: false }) }));

import AnalyticsPage from '../AnalyticsPage';

it('Bug UX-823 — every visible cohort number is accompanied by definition, source, freshness, and decision boundary', async () => {
  apiGet.mockResolvedValueOnce({ data: { data: [{
    cohort: '2026-08', cohortSize: 4,
    periods: [{ period: 0, value: 2, percentage: 50 }],
  }] } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={client}>
      <MemoryRouter><AnalyticsPage /></MemoryRouter>
    </QueryClientProvider>,
  );

  expect(screen.getByText(/Customers grouped by Manila signup month/)).toBeInTheDocument();
  expect(screen.getByText(/Customer account creation plus booking creation time/)).toBeInTheDocument();
  expect(await screen.findByText(/Generated .* PHT/)).toBeInTheDocument();
  expect(screen.getByText(/Booking activity is not completed service/)).toBeInTheDocument();
});
