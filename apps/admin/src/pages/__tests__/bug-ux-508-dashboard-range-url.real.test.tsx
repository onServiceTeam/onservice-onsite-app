import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';

const apiGet = vi.hoisted(() => vi.fn());
vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));
vi.mock('@/lib/api', () => ({ default: { get: apiGet } }));
vi.mock('@/lib/use-admin-socket', () => ({ useAdminSocketEvent: vi.fn() }));

import DashboardPage from '../DashboardPage';

function LocationProbe(): React.ReactElement {
  return <output data-testid="location">{useLocation().search}</output>;
}

beforeEach(() => {
  apiGet.mockReset();
  apiGet.mockImplementation((url: string) => {
    if (url.includes('/dashboard/kpis')) return Promise.resolve({ data: { data: {
      revenue: 0, revenueTrendPct: 0, activeBookings: 0, pendingDisputes: 0,
      newSignups: 0, pendingApprovals: 0, todayBookings: 0, escalatedDisputes: 0,
      staleDisputes: 0, escrowBalance: 0, platformRevenue: 0, guaranteeFund: 0,
      guaranteeFundRunwayMonths: 99,
    } } });
    if (url.includes('/acquisition-funnel')) {
      return Promise.resolve({ data: { data: { registered: 0, firstBooking: 0, repeatBooking: 0 } } });
    }
    return Promise.resolve({ data: { data: [] } });
  });
});

it('Bug UX-508 — Dashboard reporting range is URL-bound and drives every ranged source for a reproducible handoff', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/?range=30d']}>
        <DashboardPage />
        <LocationProbe />
      </MemoryRouter>
    </QueryClientProvider>,
  );

  expect(await screen.findByRole('combobox', { name: 'Date range' })).toHaveValue('30d');
  await waitFor(() => expect(apiGet).toHaveBeenCalledWith('/api/v1/admin/dashboard/kpis?range=30d'));
  expect(apiGet).toHaveBeenCalledWith('/api/v1/admin/dashboard/revenue-trend?days=30');

  fireEvent.change(screen.getByRole('combobox', { name: 'Date range' }), { target: { value: '7d' } });
  await waitFor(() => expect(screen.getByTestId('location')).toHaveTextContent('?range=7d'));
  await waitFor(() => expect(apiGet).toHaveBeenCalledWith('/api/v1/admin/dashboard/kpis?range=7d'));
});
