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

it('Bug UX-341 — commission analytics presents evidence without an automated rate recommendation', async () => {
  apiGet.mockResolvedValueOnce({ data: { data: [{
    tier: 'verified', currentRate: 0.13, providerCount: 2,
    legacyQualitySampleCount: 1, averageCompletedBookings: 1.5,
    averageCompletedBookingValue: 125000, sampleStatus: 'insufficient',
  }] } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter><AnalyticsPage /></MemoryRouter>
    </QueryClientProvider>,
  );

  expect(screen.getByText(/E48 removes automated rate advice/)).toBeInTheDocument();
  expect(await screen.findByText('Current base agreement 13.00%')).toBeInTheDocument();
  expect(screen.getByText(/Evidence is too small for comparison/)).toBeInTheDocument();
  expect(screen.queryByText(/Rule output:/)).not.toBeInTheDocument();
  expect(screen.queryByText(/Suggested:/)).not.toBeInTheDocument();
});
