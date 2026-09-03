import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const ROLE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const apiMocks = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn(), post: vi.fn(), delete: vi.fn() }));

vi.mock('@/lib/api', () => ({
  default: apiMocks,
  getErrorMessage: (error: unknown) => error instanceof Error ? error.message : String(error),
}));
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { role: 'super_admin' } }),
}));
vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));

import AuditLogPage from '../AuditLogPage';
import StaffRolesPage from '../StaffRolesPage';

it('Bug UX-1124 - an Admin role audit event opens the exact retained archived profile when the active list fails', async () => {
  apiMocks.get.mockImplementation(async (url: string) => {
    if (url === '/api/v1/admin/audit-log') return { data: { data: [{
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', source: 'admin_actions',
      userId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', userEmail: 'o***@example.com',
      userRole: 'super_admin', action: 'admin_role_archived', entityType: 'admin_role',
      entityId: ROLE_ID, oldValues: null, newValues: { roleName: 'legacy_moderator' },
      ipAddress: null, userAgent: null, reason: 'Profile replaced.',
      createdAt: '2026-09-03T10:00:00.000Z',
    }], pagination: { page: 1, pageSize: 50, total: 1, totalPages: 1 } } };
    if (url === `/api/v1/staff/roles/${ROLE_ID}`) return { data: { success: true, data: {
      id: ROLE_ID, name: 'legacy_moderator', description: 'Historical moderation metadata',
      permissions: ['support.view'], active_staff_count: '0', historical_staff_count: '3',
      created_at: '2026-08-01T00:00:00.000Z', updated_at: '2026-09-03T00:00:00.000Z',
      deleted_at: '2026-09-03T00:00:00.000Z', deleted_reason: 'Profile replaced by case reviewer.',
    } } };
    if (url === '/api/v1/staff/roles') throw new Error('Active role list unavailable');
    if (url === '/api/v1/staff/permissions') return { data: { data: [] } };
    throw new Error(`Unexpected GET ${url}`);
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  const view = render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/audit-log']}>
        <Routes>
          <Route path="/audit-log" element={<AuditLogPage />} />
          <Route path="/staff" element={<StaffRolesPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );

  const destination = `/staff?tab=roles&roleProfileId=${ROLE_ID}`;
  const link = await screen.findByRole('link', { name: /Open exact role profile/ });
  expect(link).toHaveAttribute('href', destination);
  fireEvent.click(link);

  expect(await screen.findByText('Linked current role profile')).toBeVisible();
  expect(screen.getByText(ROLE_ID)).toBeVisible();
  expect(screen.getByText('Current status').parentElement).toHaveTextContent('Current statusArchived');
  expect(screen.getByText('Profile replaced by case reviewer.')).toBeVisible();
  expect(screen.getByText(/not an immutable historical version/i)).toBeVisible();
  expect(await screen.findByText(/Role profiles are unavailable/)).toBeVisible();
  expect(view.container.querySelector(`a[href="${destination}"]`)).toBeNull();
});
