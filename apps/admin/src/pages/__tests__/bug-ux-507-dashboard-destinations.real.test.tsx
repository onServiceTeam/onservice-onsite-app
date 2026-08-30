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
  revenue: 0, revenueTrendPct: 0, activeBookings: 0, pendingDisputes: 0,
  newSignups: 0, pendingApprovals: 0, todayBookings: 0, escalatedDisputes: 0,
  staleDisputes: 0, escrowBalance: 1200, platformRevenue: 3400, guaranteeFund: 5000,
  guaranteeFundRunwayMonths: 4,
};

beforeEach(() => {
  apiGet.mockReset();
  apiGet.mockImplementation((url: string) => {
    if (url.includes('/dashboard/kpis')) return Promise.resolve({ data: { data: kpis } });
    if (url === '/api/v1/admin/compliance/dsr-alerts') {
      return Promise.resolve({ data: { data: [{
        id: 'dsr-1', requestType: 'access', userEmail: null,
        dueAt: '2026-09-01T00:00:00.000Z', daysUntilDue: 2, isOverdue: false,
      }] } });
    }
    if (url.includes('/dashboard/cities')) {
      return Promise.resolve({ data: { data: [{
        id: 'area-1', name: 'Cebu City', status: 'active', activeProviders: 4, todayBookings: 3,
      }] } });
    }
    if (url.includes('/acquisition-funnel')) {
      return Promise.resolve({ data: { data: { registered: 0, firstBooking: 0, repeatBooking: 0 } } });
    }
    return Promise.resolve({ data: { data: [] } });
  });
});

it('Bug UX-507 — Dashboard privacy, service-area, and wallet links land on routed filtered workspaces instead of dead or generic destinations', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter><DashboardPage /></MemoryRouter>
    </QueryClientProvider>,
  );

  const dsrRow = (await screen.findByText('DSR access due soon')).closest('li');
  expect(dsrRow?.querySelector('a')).toHaveAttribute('href', '/data-protection-log');
  expect(screen.getByText('Cebu City').closest('a')).toHaveAttribute('href', '/service-areas?search=Cebu%20City');
  expect(screen.getByText('Platform Escrow').closest('a')).toHaveAttribute('href', '/financials?tab=escrow');
  expect(screen.getByText('Guarantee Fund').closest('a')).toHaveAttribute('href', '/financials?tab=guarantee');
});
