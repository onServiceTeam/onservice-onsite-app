// HA-M3-66 (D38 Milestone 3): the Command Center has an action card
// "Requests waiting more than N minutes" (N = the amber alert setting) with
// the count from GET /api/v1/admin/marketplace-health/summary, linking to
// Marketplace, Waiting now. The existing action cards stay as they were.
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
    if (url === '/api/v1/admin/marketplace-health/summary') {
      return Promise.resolve({ data: { success: true, data: {
        waitingCount: 6, waitingOverAmber: 4, waitingOverRed: 1, awaitingCustomer: 2,
        openAlerts: 5, unacknowledgedAlerts: 3, amberMinutes: 7, redMinutes: 12,
      } } });
    }
    return Promise.resolve({ data: { data: [] } });
  });
});

it('HA-M3-66: the dashboard shows "Requests waiting more than N minutes" with the summary count, linking to Waiting now', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter><DashboardPage /></MemoryRouter>
    </QueryClientProvider>,
  );

  const card = await screen.findByRole('link', { name: 'Open Requests waiting more than 7 minutes queue' });
  expect(card).toHaveAttribute('href', '/marketplace?tab=waiting');
  expect(within(card).getByText('4')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Open Paid needs assignment queue' })).toHaveAttribute('href', '/bookings?view=unassigned');
  expect(screen.getByText('Operational sources checked')).toBeInTheDocument();
});
