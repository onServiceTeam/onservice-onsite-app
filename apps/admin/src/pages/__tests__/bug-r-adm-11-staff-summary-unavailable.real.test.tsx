import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const apiGet = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', () => ({
  default: { get: apiGet, post: vi.fn(), put: vi.fn(), delete: vi.fn() },
  getErrorMessage: (error: Error) => error.message,
}));
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { role: 'super_admin' } }),
}));

import StaffRolesPage from '../StaffRolesPage';

it('Bug R-ADM-11 — a failed staff directory read shows Unavailable on the summary tiles instead of zero', async () => {
  apiGet.mockImplementation((url: string) => {
    if (url.startsWith('/api/v1/staff?')) return Promise.reject(new Error('Staff directory unavailable.'));
    if (url === '/api/v1/staff/roles') return Promise.resolve({ data: { data: [] } });
    return Promise.resolve({ data: { data: [] } });
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/staff']}><StaffRolesPage /></MemoryRouter>
    </QueryClientProvider>,
  );

  expect(await screen.findByRole('button', { name: 'Retry staff directory' })).toBeInTheDocument();
  const summary = screen.getByRole('region', { name: 'Staff directory summary' });
  for (const label of ['Directory profiles', 'Active profiles', 'Admin-tier accounts', 'Accounts missing profiles']) {
    const tile = within(summary).getByText(label).parentElement as HTMLElement;
    expect(within(tile).getByText('Unavailable')).toBeInTheDocument();
  }
  expect(within(summary).getAllByText('Unavailable')).toHaveLength(4);
  expect(within(summary).queryByText('0')).not.toBeInTheDocument();
});

const SUMMARY_LABELS = ['Directory profiles', 'Active profiles', 'Admin-tier accounts', 'Accounts missing profiles'];

function renderStaffPage(): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/staff']}><StaffRolesPage /></MemoryRouter>
    </QueryClientProvider>,
  );
}

function expectSummaryTilesLoading(): void {
  const summary = screen.getByRole('region', { name: 'Staff directory summary' });
  for (const label of SUMMARY_LABELS) {
    const tile = within(summary).getByText(label).parentElement as HTMLElement;
    expect(within(tile).getByText('Loading…')).toBeInTheDocument();
  }
  expect(within(summary).getAllByText('Loading…')).toHaveLength(4);
  expect(within(summary).queryByText('0')).not.toBeInTheDocument();
}

it('Bug R-ADM-11 — while the staff directory is still loading the summary tiles say Loading instead of zero', async () => {
  apiGet.mockImplementation((url: string) => {
    if (url.startsWith('/api/v1/staff?')) return new Promise(() => {});
    return Promise.resolve({ data: { data: [] } });
  });
  renderStaffPage();

  expect(await screen.findByText('Loading staff directory...')).toBeInTheDocument();
  expectSummaryTilesLoading();
});

it('Bug R-ADM-11 — Retry on a failed staff directory read shows Loading on the summary tiles instead of zero while it waits', async () => {
  let staffAttempts = 0;
  apiGet.mockImplementation((url: string) => {
    if (url.startsWith('/api/v1/staff?')) {
      staffAttempts += 1;
      if (staffAttempts === 1) return Promise.reject(new Error('Staff directory unavailable.'));
      return new Promise(() => {});
    }
    return Promise.resolve({ data: { data: [] } });
  });
  renderStaffPage();

  fireEvent.click(await screen.findByRole('button', { name: 'Retry staff directory' }));

  expect(await screen.findByText('Loading staff directory...')).toBeInTheDocument();
  expect(staffAttempts).toBe(2);
  expectSummaryTilesLoading();
});

// The directory role profiles load from their own request. They resolve
// successfully in these freshness tests so a roles success cannot stand in
// for a directory success on the "Staff directory" freshness line.
const DIRECTORY_ROLE = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'dispatch_lead',
  description: null,
  permissions: [],
  created_at: '2026-10-01T00:00:00.000Z',
  updated_at: '2026-10-01T00:00:00.000Z',
};

function staffFreshnessLine(): HTMLElement {
  const line = screen.getAllByRole('status').find((element) => element.textContent?.startsWith('Staff directory:'));
  if (!line) throw new Error('Staff directory freshness line is not rendered');
  return line;
}

async function waitForDirectoryRoles(): Promise<void> {
  expect(await screen.findByRole('option', { name: 'Dispatch Lead' })).toBeInTheDocument();
}

it('Bug R-ADM-11 — a failed first staff directory read does not claim a successful update on the freshness line', async () => {
  apiGet.mockImplementation((url: string) => {
    if (url.startsWith('/api/v1/staff?')) return Promise.reject(new Error('Staff directory unavailable.'));
    if (url === '/api/v1/staff/roles') return Promise.resolve({ data: { data: [DIRECTORY_ROLE] } });
    return Promise.resolve({ data: { data: [] } });
  });
  renderStaffPage();

  expect(await screen.findByRole('button', { name: 'Retry staff directory' })).toBeInTheDocument();
  await waitForDirectoryRoles();
  expect(staffFreshnessLine()).toHaveTextContent('Staff directory: No successful update yet.');
  expect(staffFreshnessLine()).not.toHaveTextContent('Last successful update');
});

it('Bug R-ADM-11 — while the first staff directory read is in progress the freshness line does not claim a successful update', async () => {
  apiGet.mockImplementation((url: string) => {
    if (url.startsWith('/api/v1/staff?')) return new Promise(() => {});
    if (url === '/api/v1/staff/roles') return Promise.resolve({ data: { data: [DIRECTORY_ROLE] } });
    return Promise.resolve({ data: { data: [] } });
  });
  renderStaffPage();

  expect(await screen.findByText('Loading staff directory...')).toBeInTheDocument();
  await waitForDirectoryRoles();
  expect(staffFreshnessLine()).toHaveTextContent('Staff directory: No successful update yet.');
  expect(staffFreshnessLine()).not.toHaveTextContent('Last successful update');
  expect(screen.getByRole('button', { name: 'Refresh Staff directory' })).toHaveTextContent('Refreshing…');
});

it('Bug R-ADM-11 — after a successful staff directory read the freshness line shows the last successful update', async () => {
  apiGet.mockImplementation((url: string) => {
    if (url.startsWith('/api/v1/staff?')) return Promise.resolve({ data: { data: [], meta: { total: 0, summary: {
      totalProfiles: 12, activeProfiles: 10, inactiveProfiles: 2, activeAccounts: 11, inactiveAccounts: 1,
      activeSupportOwners: 4, totalAdminAccounts: 14, unprofiledAdminAccounts: 2,
    } } } });
    if (url === '/api/v1/staff/roles') return Promise.resolve({ data: { data: [DIRECTORY_ROLE] } });
    return Promise.resolve({ data: { data: [] } });
  });
  renderStaffPage();

  const summary = screen.getByRole('region', { name: 'Staff directory summary' });
  expect(await within(summary).findByText('12')).toBeInTheDocument();
  await waitForDirectoryRoles();
  expect(staffFreshnessLine()).toHaveTextContent('Staff directory: Last successful update just now.');
  expect(screen.getByRole('button', { name: 'Refresh Staff directory' })).toHaveTextContent(/^Refresh$/);
  expect(screen.getByRole('button', { name: 'Refresh Staff directory' })).toBeEnabled();
});
