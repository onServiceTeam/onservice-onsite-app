// HA-M3-67 (D38 Milestone 3): when the marketplace summary cannot be loaded
// the waiting-requests card says "Unavailable" instead of a reassuring 0, and
// the failure counts in the Command Center's "sources unavailable" badge.
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';

const apiGet = vi.hoisted(() => vi.fn());
vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));
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
    if (url.includes('/acquisition-funnel')) {
      return Promise.resolve({ data: { data: { registered: 0, firstBooking: 0, repeatBooking: 0 } } });
    }
    if (url === '/api/v1/admin/marketplace-health/summary') return Promise.reject(new Error('summary offline'));
    return Promise.resolve({ data: { data: [] } });
  });
});

it('HA-M3-67: a failed marketplace summary shows "Unavailable" on the waiting card and counts as an unavailable source', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter><DashboardPage /></MemoryRouter>
    </QueryClientProvider>,
  );

  expect(await screen.findByText('1 source unavailable')).toBeInTheDocument();
  const card = screen.getByRole('link', { name: 'Open Requests waiting for a quote queue' });
  expect(card).toHaveAttribute('href', '/marketplace?tab=waiting');
  expect(within(card).getByText('Unavailable')).toBeInTheDocument();
  expect(within(card).queryByText('0')).not.toBeInTheDocument();
});
