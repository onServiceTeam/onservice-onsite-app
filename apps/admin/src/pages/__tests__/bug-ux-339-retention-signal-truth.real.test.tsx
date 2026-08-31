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
    useSearchParams: () => [new URLSearchParams('tab=churn'), vi.fn()],
  };
});

import AnalyticsPage from '../AnalyticsPage';

it('Bug UX-339 — retention analytics names its deterministic inputs truthfully and links each signal to Customer 360', async () => {
  apiGet.mockResolvedValueOnce({ data: { data: [{
    userId: 'customer-1', name: 'Ana Reyes', phone: '+63 9XX XXX 4567', contactMasked: true,
    lastBookingDate: '2026-08-01T00:00:00.000Z', daysSinceLastBooking: 24,
    totalBookings: 3, totalBookedValue: 250000, riskScore: 25, riskLevel: 'low',
  }], pagination: { total: 1, totalPages: 1 } } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter><AnalyticsPage /></MemoryRouter>
    </QueryClientProvider>,
  );

  expect(await screen.findByText(/A deterministic attention score/)).toBeInTheDocument();
  expect(screen.getByText(/This is not churn prediction/)).toBeInTheDocument();
  expect(await screen.findByText('Recorded booking value')).toBeInTheDocument();
  expect(screen.getByText('Attention score')).toBeInTheDocument();
  expect(screen.queryByText('Total Spent')).not.toBeInTheDocument();
  expect(await screen.findByRole('link', { name: 'Ana Reyes' })).toHaveAttribute('href', '/customers/customer-1');
  expect(screen.getAllByText(/masked/).length).toBeGreaterThan(0);
});
