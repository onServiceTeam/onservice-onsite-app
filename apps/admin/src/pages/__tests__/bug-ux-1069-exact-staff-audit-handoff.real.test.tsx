import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));

const { PROFILE_ID, USER_ID, ROLE_ID, apiGet } = vi.hoisted(() => ({
  PROFILE_ID: '11111111-1111-4111-8111-111111111111',
  USER_ID: '22222222-2222-4222-8222-222222222222',
  ROLE_ID: '33333333-3333-4333-8333-333333333333',
  apiGet: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  default: { get: apiGet, post: vi.fn(), put: vi.fn(), delete: vi.fn() },
  getErrorMessage: (error: Error) => error.message,
}));
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { role: 'super_admin' } }),
}));

import AuditLogPage from '../AuditLogPage';
import StaffRolesPage from '../StaffRolesPage';

function client(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
}

function LocationEvidence(): React.ReactElement {
  const location = useLocation();
  return <output aria-label="Current staff handoff query">{location.search}</output>;
}

it('Bug UX-1069 — a staff-profile audit event restores the exact acted-on directory record', async () => {
  apiGet.mockImplementation((url: string) => {
    if (url === '/api/v1/admin/audit-log') {
      return Promise.resolve({ data: {
        data: [{
          id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          source: 'admin_actions',
          userId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          userEmail: 'o***@e***',
          userRole: 'super_admin',
          action: 'staff_added',
          entityType: 'admin_staff',
          entityId: PROFILE_ID,
          oldValues: null,
          newValues: { addedUserId: USER_ID, addedRoleId: ROLE_ID },
          ipAddress: null,
          userAgent: null,
          reason: 'Add support operations profile',
          createdAt: '2026-09-03T10:00:00.000Z',
        }],
        pagination: { page: 1, pageSize: 50, total: 1, totalPages: 1 },
      } });
    }
    if (url.startsWith('/api/v1/staff?')) {
      return Promise.resolve({ data: {
        data: [{
          id: PROFILE_ID,
          profile_id: PROFILE_ID,
          user_id: USER_ID,
          role_id: ROLE_ID,
          is_active: true,
          last_login_at: '2026-09-03T08:00:00.000Z',
          user_first_name: 'Ana',
          user_last_name: 'Reyes',
          user_email: 'ana@example.com',
          user_phone: '+639171234567',
          role_name: 'support_agent',
          account_role: 'admin',
          account_is_active: true,
          active_support_cases: '2',
        }],
        meta: { total: 1, summary: {
          totalProfiles: 1, activeProfiles: 1, inactiveProfiles: 0,
          activeAccounts: 1, inactiveAccounts: 0, activeSupportOwners: 1,
          totalAdminAccounts: 1, unprofiledAdminAccounts: 0,
        } },
      } });
    }
    if (url === '/api/v1/staff/roles') {
      return Promise.resolve({ data: { data: [{
        id: ROLE_ID,
        name: 'support_agent',
        description: 'Support profile',
        permissions: ['support.view'],
        created_at: '',
        updated_at: '',
      }] } });
    }
    return Promise.resolve({ data: { data: [] } });
  });

  const handoffRender = render(
    <QueryClientProvider client={client()}>
      <MemoryRouter initialEntries={['/audit-log']}>
        <LocationEvidence />
        <Routes>
          <Route path="/audit-log" element={<AuditLogPage />} />
          <Route path="/staff" element={<StaffRolesPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );

  expect((await screen.findAllByText(/Staff directory profile/)).length).toBeGreaterThan(0);
  const destination = `/staff?search=${PROFILE_ID}`;
  const destinationLink = handoffRender.container.querySelector(`a[href="${destination}"]`);
  expect(destinationLink).not.toBeNull();
  fireEvent.click(destinationLink!);

  expect(await screen.findByText('Ana Reyes')).toBeVisible();
  expect(screen.getByLabelText('Current staff handoff query')).toHaveTextContent(`?search=${PROFILE_ID}`);
  expect(apiGet).toHaveBeenCalledWith(expect.stringContaining(`search=${PROFILE_ID}`));
});
