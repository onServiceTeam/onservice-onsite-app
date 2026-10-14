import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';

const apiGet = vi.hoisted(() => vi.fn());
vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));
vi.mock('@/lib/api', () => ({ default: { get: apiGet } }));
vi.mock('@/lib/use-admin-socket', () => ({ useAdminSocketEvent: vi.fn() }));
vi.unmock('@/stores/auth.store');

import DashboardPage from '../DashboardPage';
import { useAuthStore, type AdminUser } from '@/stores/auth.store';

const DSR_ALERTS = '/api/v1/admin/compliance/dsr-alerts';
const MARKETPLACE_SUMMARY = '/api/v1/admin/marketplace-health/summary';

const kpis = {
  revenue: 1000, revenueTrendPct: 0, activeBookings: 1, pendingDisputes: 0,
  newSignups: 1, pendingApprovals: 0, todayBookings: 1, escalatedDisputes: 0,
  staleDisputes: 0, escrowBalance: 0, platformRevenue: 0, guaranteeFund: 0,
  guaranteeFundRunwayMonths: 99,
};

const operator: AdminUser = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', role: 'admin', firstName: 'Synthetic',
  lastName: 'Operator', email: 'operator@example.invalid', phone: '', avatarUrl: null,
};
const supervisor: AdminUser = { ...operator, id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', role: 'super_admin' };
const privacyOfficer: AdminUser = { ...operator, id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', role: 'dpo' };

function signIn(user: AdminUser): void {
  useAuthStore.setState({ user, isAuthenticated: true, isLoading: false, mustRotatePassword: false });
}

function renderDashboard(): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter><DashboardPage /></MemoryRouter>
    </QueryClientProvider>,
  );
}

/** Waits until the first load of every dashboard source has finished. */
async function waitForDashboardToSettle(): Promise<void> {
  expect(await screen.findByText('Command Center')).toBeInTheDocument();
  await waitFor(() => expect(screen.queryByText('Checking operational alerts...')).not.toBeInTheDocument());
  await waitFor(() => expect(screen.getByRole('button', { name: 'Refresh' })).toBeEnabled());
}

beforeEach(() => {
  apiGet.mockReset();
  apiGet.mockImplementation((url: string) => {
    // The server refuses plain admins here (requireDpoRole: super_admin + dpo only).
    if (url === DSR_ALERTS) return Promise.reject(new Error('This endpoint requires DPO or super_admin role.'));
    if (url.includes('/dashboard/kpis')) return Promise.resolve({ data: { data: kpis } });
    if (url.includes('/acquisition-funnel')) return Promise.resolve({ data: { data: { registered: 1, firstBooking: 0, repeatBooking: 0 } } });
    return Promise.resolve({ data: { data: [] } });
  });
});

it('Bug R-ADM-01 — a plain admin dashboard does not ask for privacy deadlines it is not allowed to read', async () => {
  signIn(operator);
  renderDashboard();
  await waitForDashboardToSettle();

  expect(apiGet).toHaveBeenCalledWith(expect.stringContaining('/dashboard/alerts'));
  expect(apiGet).not.toHaveBeenCalledWith(DSR_ALERTS);
});

it('Bug R-ADM-01 — a plain admin dashboard shows no data-rights source unavailable alert', async () => {
  signIn(operator);
  renderDashboard();
  await waitForDashboardToSettle();

  expect(screen.queryByText('Data-rights deadline source unavailable')).not.toBeInTheDocument();
});

it('Bug R-ADM-01 — a plain admin dashboard does not count the privacy deadline source as unavailable', async () => {
  signIn(operator);
  renderDashboard();
  await waitForDashboardToSettle();

  expect(screen.getByText('Operational sources checked')).toBeInTheDocument();
  expect(screen.queryByText(/sources? unavailable/)).not.toBeInTheDocument();
});

it('Bug R-ADM-01 — Refresh on a plain admin dashboard does not ask for privacy deadlines', async () => {
  signIn(operator);
  renderDashboard();
  await waitForDashboardToSettle();
  apiGet.mockClear();

  fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));

  // Refresh asks every source again, ending with the waiting-requests summary.
  await waitFor(() => expect(apiGet).toHaveBeenCalledWith(MARKETPLACE_SUMMARY, expect.anything()));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Refresh' })).toBeEnabled());
  expect(apiGet).toHaveBeenCalledWith(expect.stringContaining('/dashboard/kpis'));
  expect(apiGet).not.toHaveBeenCalledWith(DSR_ALERTS);
  expect(screen.queryByText('Data-rights deadline source unavailable')).not.toBeInTheDocument();
});

it('Bug R-ADM-01 — a super_admin dashboard still asks for privacy deadlines', async () => {
  signIn(supervisor);
  renderDashboard();

  expect(await screen.findByText('Command Center')).toBeInTheDocument();
  await waitFor(() => expect(apiGet).toHaveBeenCalledWith(DSR_ALERTS));
});

it('Bug R-ADM-01 — a dpo dashboard still asks for privacy deadlines', async () => {
  signIn(privacyOfficer);
  renderDashboard();

  expect(await screen.findByText('Command Center')).toBeInTheDocument();
  await waitFor(() => expect(apiGet).toHaveBeenCalledWith(DSR_ALERTS));
});

it('Bug R-ADM-01 — Refresh on a super_admin dashboard still asks for privacy deadlines', async () => {
  signIn(supervisor);
  renderDashboard();
  await waitForDashboardToSettle();
  apiGet.mockClear();

  fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));

  // Refresh asks every source again, ending with the waiting-requests summary.
  await waitFor(() => expect(apiGet).toHaveBeenCalledWith(MARKETPLACE_SUMMARY, expect.anything()));
  await waitFor(() => expect(apiGet).toHaveBeenCalledWith(DSR_ALERTS));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Refresh' })).toBeEnabled());
});

it('Bug R-ADM-01 — Refresh on a dpo dashboard still asks for privacy deadlines', async () => {
  signIn(privacyOfficer);
  renderDashboard();
  await waitForDashboardToSettle();
  apiGet.mockClear();

  fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));

  await waitFor(() => expect(apiGet).toHaveBeenCalledWith(MARKETPLACE_SUMMARY, expect.anything()));
  await waitFor(() => expect(apiGet).toHaveBeenCalledWith(DSR_ALERTS));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Refresh' })).toBeEnabled());
});
