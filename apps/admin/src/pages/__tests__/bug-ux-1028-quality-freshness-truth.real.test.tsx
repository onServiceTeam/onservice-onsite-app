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

it('Bug UX-1028 — quality freshness uses the newest visible snapshot instead of the first score-sorted row', async () => {
  apiGet.mockResolvedValueOnce({ data: {
    data: [
      {
        providerId: 'provider-high-score', providerName: 'Older High Score', businessName: '', tier: 'verified',
        overallScore: 95, ratingScore: 95, completionScore: 95, timelinessScore: 95,
        cancellationScore: 95, responseScore: 95, totalJobsScored: 30,
        periodStart: '2026-05-01', periodEnd: '2026-07-31', computedAt: '2026-08-01T02:00:00.000Z',
      },
      {
        providerId: 'provider-newer', providerName: 'Newer Snapshot', businessName: '', tier: 'verified',
        overallScore: 70, ratingScore: 70, completionScore: 70, timelinessScore: 70,
        cancellationScore: 70, responseScore: 70, totalJobsScored: 12,
        periodStart: '2026-06-01', periodEnd: '2026-08-31', computedAt: '2026-09-01T02:00:00.000Z',
      },
    ],
    pagination: { total: 2, totalPages: 1 },
  } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={client}>
      <MemoryRouter><AnalyticsPage /></MemoryRouter>
    </QueryClientProvider>,
  );

  expect(await screen.findByText(/Newest visible snapshot calculated Sep 1, 2026, 10:00 AM PHT/)).toBeInTheDocument();
  expect(screen.queryByText(/Newest visible snapshot calculated Aug 1, 2026/)).not.toBeInTheDocument();
});
