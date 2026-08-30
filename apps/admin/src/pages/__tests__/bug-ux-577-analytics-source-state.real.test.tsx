import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, it, vi } from 'vitest';

const apiGet = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', () => ({
  default: { get: apiGet, post: vi.fn(), patch: vi.fn() },
  getErrorMessage: (error: unknown) => error instanceof Error ? error.message : 'Request failed',
}));

import AnalyticsPage from '../AnalyticsPage';

it('Bug UX-577 — an unavailable analytics source renders an actionable decision-support failure', async () => {
  apiGet.mockRejectedValue(new Error('Analytics source offline'));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(<QueryClientProvider client={client}><AnalyticsPage /></QueryClientProvider>);

  expect(await screen.findByText('Cohort analysis unavailable')).toBeInTheDocument();
  expect(screen.getByText(/Retention and revenue figures are not available/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Retry cohort analysis' })).toBeEnabled();
});
