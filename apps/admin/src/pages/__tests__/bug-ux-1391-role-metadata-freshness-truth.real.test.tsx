// Bug UX-1391 (screenshot review 2026-10-14): the Role Profiles tab's
// "Role metadata" freshness line took the newer of its two reads (role
// profiles and the permission list), so a successful permissions read made
// it say "Last successful update just now" while the role profiles had
// failed or were still loading. It now claims a successful update only once
// both reads have succeeded.
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
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

// The real router, so ?tab=roles opens the Role Profiles tab (the shared
// vitest setup stubs useSearchParams).
vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));

import StaffRolesPage from '../StaffRolesPage';

function renderRolesTab(): void {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/staff?tab=roles']}><StaffRolesPage /></MemoryRouter>
    </QueryClientProvider>,
  );
}

it('Bug UX-1391 — a failed role profiles read does not claim a successful role metadata update', async () => {
  // The permission list succeeds first; the role profiles fail only after
  // that, so the old code would already have claimed the permissions time.
  let failRoles: (error: Error) => void = () => {};
  apiGet.mockImplementation((url: string) => {
    if (url === '/api/v1/staff/roles') return new Promise((_resolve, reject) => { failRoles = reject; });
    if (url === '/api/v1/staff/permissions') return Promise.resolve({ data: { data: ['bookings.read'] } });
    return Promise.resolve({ data: { data: [] } });
  });
  renderRolesTab();

  expect(await screen.findByRole('heading', { name: 'Roles' })).toBeInTheDocument();
  await waitFor(() => expect(apiGet).toHaveBeenCalledWith('/api/v1/staff/permissions'));
  await new Promise((resolve) => setTimeout(resolve, 0));
  failRoles(new Error('Role profiles unavailable.'));
  expect(await screen.findByText(/Role profiles are unavailable/)).toBeInTheDocument();
  const line = screen.getByText(/^Role metadata:/);
  expect(line.textContent).toBe('Role metadata: No successful update yet.');
});

it('Role metadata guard (UX-1391): after both role reads succeed the line shows the update', async () => {
  apiGet.mockImplementation((url: string) => {
    if (url === '/api/v1/staff/roles') return Promise.resolve({ data: { data: [] } });
    if (url === '/api/v1/staff/permissions') return Promise.resolve({ data: { data: ['bookings.read'] } });
    return Promise.resolve({ data: { data: [] } });
  });
  renderRolesTab();

  expect(await screen.findByRole('heading', { name: 'Roles' })).toBeInTheDocument();
  await waitFor(() => expect(screen.getByText(/^Role metadata:/).textContent).toMatch(/^Role metadata: Last successful update /));
});
