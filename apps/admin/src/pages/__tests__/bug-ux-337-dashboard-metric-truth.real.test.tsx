import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';

const apiGet = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', () => ({ default: { get: apiGet } }));
vi.mock('@/lib/use-admin-socket', () => ({ useAdminSocketEvent: vi.fn() }));

import DashboardPage from '../DashboardPage';

beforeEach(() => {
  apiGet.mockReset();
  apiGet.mockImplementation((url: string) => {
    if (url.includes('/dashboard/kpis')) return Promise.resolve({ data: { data: {
      revenue: 1000, revenueTrendPct: 0, activeBookings: 1, pendingDisputes: 0,
      newSignups: 1, pendingApprovals: 0, todayBookings: 1, escalatedDisputes: 0,
      staleDisputes: 0, escrowBalance: 0, platformRevenue: 0, guaranteeFund: 0,
      guaranteeFundRunwayMonths: 99,
    } } });
    if (url.includes('/acquisition-funnel')) return Promise.resolve({ data: { data: { registered: 1, firstBooking: 0, repeatBooking: 0 } } });
    return Promise.resolve({ data: { data: [] } });
  });
});

it('Bug UX-337 — dashboard labels identify platform-fee revenue, real refresh cadence, and the non-SLA dispute threshold', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter><DashboardPage /></MemoryRouter>
    </QueryClientProvider>,
  );

  expect(await screen.findByText('Platform fee revenue')).toBeInTheDocument();
  expect(screen.getByText(/Core metrics refreshed at/)).toHaveTextContent(/acquisition refreshes every 5 minutes/);
  expect(screen.getByText(/internal attention threshold/)).toHaveTextContent(/not a promised resolution SLA/);
  expect(screen.queryByText('Live operations')).not.toBeInTheDocument();
});
