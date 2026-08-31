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
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('react-router-dom');
  return {
    ...actual,
    useSearchParams: () => [new URLSearchParams('tab=quality'), vi.fn()],
  };
});

import AnalyticsPage from '../AnalyticsPage';

it('Bug UX-824 — quality evidence exposes every stored component, snapshot period, freshness, and Provider 360 exit', async () => {
  apiGet.mockResolvedValueOnce({ data: {
    data: [{
      providerId: 'provider-1', providerName: 'Mia Santos', businessName: 'Mia Home Care', tier: 'verified',
      overallScore: 81, ratingScore: 92, completionScore: 84, timelinessScore: 71,
      cancellationScore: 88, responseScore: 67, totalJobsScored: 19,
      periodStart: '2026-06-01', periodEnd: '2026-08-30', computedAt: '2026-08-31T02:00:00.000Z',
    }],
    pagination: { total: 1, totalPages: 1 },
  } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/analytics?tab=quality']}><AnalyticsPage /></MemoryRouter>
    </QueryClientProvider>,
  );

  expect(await screen.findByRole('link', { name: 'Mia Santos' })).toHaveAttribute('href', '/providers/provider-1');
  expect(screen.getByText('Quote response')).toBeInTheDocument();
  expect(screen.getByText('67')).toBeInTheDocument();
  expect(screen.getByText('2026-06-01 to 2026-08-30')).toBeInTheDocument();
  expect(screen.getByText(/E47 holds recomputation/)).toBeInTheDocument();
});
