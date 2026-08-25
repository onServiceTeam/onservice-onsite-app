import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, it, vi } from 'vitest';

const apiGet = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', () => ({ default: { get: apiGet }, getErrorMessage: (e: Error) => e.message }));
vi.mock('@/hooks/useFeatureFlags', () => ({ useFeatureFlags: () => ({ abTestingEnabled: false }) }));

import AnalyticsPage from '../AnalyticsPage';

it('Bug UX-344 — incomplete cohort periods do not crash the whole analytics workspace', async () => {
  apiGet.mockResolvedValueOnce({ data: { data: [{ cohort: '2026-08', cohortSize: 4 }] } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><AnalyticsPage /></QueryClientProvider>);

  expect(await screen.findByText('2026-08')).toBeInTheDocument();
  expect(screen.getByText('4')).toBeInTheDocument();
  expect(screen.getAllByText('—')).toHaveLength(6);
});
