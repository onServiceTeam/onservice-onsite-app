import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const apiGet = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', () => ({ default: { get: apiGet }, getErrorMessage: (error: Error) => error.message }));
vi.mock('@/hooks/useFeatureFlags', () => ({ useFeatureFlags: () => ({ abTestingEnabled: false }) }));
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('react-router-dom');
  return {
    ...actual,
    useSearchParams: () => [new URLSearchParams('tab=commission'), vi.fn()],
  };
});

import AnalyticsPage from '../AnalyticsPage';

it('Bug OPS-276 — commission analytics preserves two-decimal agreement precision', async () => {
  apiGet.mockResolvedValueOnce({ data: { data: [{
    tier: 'verified', currentRate: 0.125, providerCount: 10,
    legacyQualitySampleCount: 10, averageCompletedBookings: 7,
    averageCompletedBookingValue: 125000, sampleStatus: 'available',
  }] } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter><AnalyticsPage /></MemoryRouter>
    </QueryClientProvider>,
  );

  expect(await screen.findByText('Current base agreement 12.50%')).toBeInTheDocument();
  expect(screen.queryByText('Current base agreement 13%')).not.toBeInTheDocument();
});
