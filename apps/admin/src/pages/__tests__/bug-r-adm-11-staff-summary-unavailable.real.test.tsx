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
