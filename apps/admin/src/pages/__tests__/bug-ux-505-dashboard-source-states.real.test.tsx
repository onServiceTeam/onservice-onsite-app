import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';

const apiGet = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', () => ({ default: { get: apiGet } }));
vi.mock('@/lib/use-admin-socket', () => ({ useAdminSocketEvent: vi.fn() }));

import DashboardPage from '../DashboardPage';

const kpis = {
  revenue: 0, revenueTrendPct: 0, activeBookings: 0, pendingDisputes: 0,
  newSignups: 0, pendingApprovals: 0, todayBookings: 0, escalatedDisputes: 0,
  staleDisputes: 0, escrowBalance: 0, platformRevenue: 0, guaranteeFund: 0,
  guaranteeFundRunwayMonths: 99,
};

beforeEach(() => {
  apiGet.mockReset();
  apiGet.mockImplementation((url: string) => {
    if (url.includes('/dashboard/kpis')) return Promise.resolve({ data: { data: kpis } });
    if (url.includes('/revenue-trend') || url.includes('/booking-volume') || url.includes('/dashboard/cities')) {
      return Promise.reject(new Error('source offline'));
    }
    if (url.includes('/acquisition-funnel')) {
      return Promise.resolve({ data: { data: { registered: 0, firstBooking: 0, repeatBooking: 0 } } });
    }
    return Promise.resolve({ data: { data: [] } });
  });
});

it('Bug UX-505 — failed Dashboard chart and city sources render unavailable states instead of false empty business results', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter><DashboardPage /></MemoryRouter>
    </QueryClientProvider>,
  );

  expect(await screen.findByText('Revenue trend source unavailable')).toBeInTheDocument();
  expect(screen.getByText('Booking volume source unavailable')).toBeInTheDocument();
  expect(screen.getByText('Service-area performance source unavailable')).toBeInTheDocument();
  expect(screen.getByText('3 sources unavailable')).toBeInTheDocument();
  expect(screen.queryByText('No revenue data yet')).not.toBeInTheDocument();
  expect(screen.queryByText('No service areas')).not.toBeInTheDocument();
});
