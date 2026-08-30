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
  revenue: 1000, revenueTrendPct: 0, activeBookings: 1, pendingDisputes: 0,
  newSignups: 1, pendingApprovals: 0, todayBookings: 1, escalatedDisputes: 0,
  staleDisputes: 0, escrowBalance: 0, platformRevenue: 0, guaranteeFund: 0,
  guaranteeFundRunwayMonths: 99,
};

beforeEach(() => {
  apiGet.mockReset();
  apiGet.mockImplementation((url: string) => {
    if (url === '/api/v1/admin/compliance/dsr-alerts') return Promise.reject(new Error('offline'));
    if (url.includes('/dashboard/kpis')) return Promise.resolve({ data: { data: kpis } });
    if (url.includes('/acquisition-funnel')) return Promise.resolve({ data: { data: { registered: 1, firstBooking: 0, repeatBooking: 0 } } });
    return Promise.resolve({ data: { data: [] } });
  });
});

it('Bug UX-336 — a failed privacy-deadline source appears as an actionable dashboard alert instead of a false clear queue', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter><DashboardPage /></MemoryRouter>
    </QueryClientProvider>,
  );

  expect(await screen.findByText('Data-rights deadline source unavailable')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /^View$/ }).closest('a')).toHaveAttribute('href', '/data-protection-log');
  expect(screen.queryByText('All systems healthy. Nothing requires intervention right now.')).not.toBeInTheDocument();
});
