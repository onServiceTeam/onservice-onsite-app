import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';

const apiGet = vi.hoisted(() => vi.fn());
vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));
vi.mock('@/lib/api', () => ({ default: { get: apiGet } }));
vi.mock('@/lib/use-admin-socket', () => ({ useAdminSocketEvent: vi.fn() }));

import DashboardPage from '../DashboardPage';

const kpis = {
  revenue: 1000, revenueTrendPct: 0, activeBookings: 9, paidUnassignedBookings: 3,
  pendingDisputes: 4, newSignups: 5, pendingApprovals: 2, openSupportCases: 8,
  unassignedSupportCases: 6, urgentSupportCases: 1, newFeedback: 7, todayBookings: 4,
  escalatedDisputes: 2, staleDisputes: 1, escrowBalance: 0, platformRevenue: 0,
  guaranteeFund: 0, guaranteeFundRunwayMonths: 99,
};

beforeEach(() => {
  apiGet.mockReset();
  apiGet.mockImplementation((url: string) => {
    if (url.includes('/dashboard/kpis')) return Promise.resolve({ data: { data: kpis } });
    if (url.includes('/acquisition-funnel')) {
      return Promise.resolve({ data: { data: { registered: 5, firstBooking: 2, repeatBooking: 1 } } });
    }
    return Promise.resolve({ data: { data: [] } });
  });
});

it('Bug UX-504 — Dashboard action cards open the exact booking, support, provider, dispute, and feedback work queues', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter><DashboardPage /></MemoryRouter>
    </QueryClientProvider>,
  );

  expect(await screen.findByRole('link', { name: 'Open Paid needs assignment queue' })).toHaveAttribute('href', '/bookings?view=unassigned');
  expect(screen.getByRole('link', { name: 'Open Unassigned support queue' })).toHaveAttribute('href', '/support-tickets?unassigned=1&active=1');
  expect(screen.getByRole('link', { name: 'Open Urgent support queue' })).toHaveAttribute('href', '/support-tickets?priority=urgent&active=1');
  expect(screen.getByRole('link', { name: 'Open Active disputes queue' })).toHaveAttribute('href', '/disputes?view=active');
  expect(screen.getByRole('link', { name: 'Open Open disputes (48h+) queue' })).toHaveAttribute('href', '/disputes?view=stale');
  expect(screen.getByRole('link', { name: 'Open New tester feedback queue' })).toHaveAttribute('href', '/feedback');
  expect(screen.getByText(/8 support cases are currently open/)).toBeInTheDocument();
});
