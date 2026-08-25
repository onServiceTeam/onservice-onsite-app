import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const apiGet = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', () => ({ default: { get: apiGet }, getErrorMessage: (e: Error) => e.message }));
vi.mock('@/hooks/useFeatureFlags', () => ({ useFeatureFlags: () => ({ abTestingEnabled: false }) }));
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('react-router-dom');
  return {
    ...actual,
    useSearchParams: () => [new URLSearchParams('tab=commission'), vi.fn()],
  };
});

import AnalyticsPage from '../AnalyticsPage';

it('Bug UX-341 — commission analytics presents a read-only rule output with sample size instead of an approved recommendation', async () => {
  apiGet.mockResolvedValueOnce({ data: { data: [{
    tier: 'verified', currentRate: 0.13, suggestedRate: 0.13, providerCount: 2,
    qualitySampleCount: 1, averageCompletedBookings: 1.5, avgQualityScore: 72,
    avgRevenue: 125000, rationale: 'Insufficient sample for a rate signal.',
  }] } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter><AnalyticsPage /></MemoryRouter>
    </QueryClientProvider>,
  );

  expect(await screen.findByText('Read-only rule outputs, not approved pricing decisions')).toBeInTheDocument();
  expect(await screen.findByText(/Rule output:/)).toBeInTheDocument();
  expect(await screen.findByText(/Sample: 2 approved providers, 1 current quality scores/)).toBeInTheDocument();
  expect(screen.queryByText(/Suggested:/)).not.toBeInTheDocument();
});
