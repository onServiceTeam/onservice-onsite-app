import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const {
  ACTOR_ID,
  CUSTOMER_ID,
  PROVIDER_USER_ID,
  PROVIDER_ID,
  STAFF_ID,
} = vi.hoisted(() => ({
  ACTOR_ID: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  CUSTOMER_ID: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  PROVIDER_USER_ID: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  PROVIDER_ID: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  STAFF_ID: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
}));

vi.mock('@/lib/api', () => ({
  default: {
    get: vi.fn().mockResolvedValue({
      data: {
        data: [
          {
            id: '11111111-1111-4111-8111-111111111111',
            source: 'admin_actions',
            userId: ACTOR_ID,
            userEmail: 'o***@e***',
            userRole: 'super_admin',
            targetUserRole: 'customer',
            targetProviderId: null,
            action: 'user_force_logout',
            entityType: 'user',
            entityId: CUSTOMER_ID,
            oldValues: null,
            newValues: { accountType: 'customer' },
            ipAddress: null,
            userAgent: null,
            reason: 'Support containment',
            createdAt: '2026-09-03T09:00:00.000Z',
          },
          {
            id: '22222222-2222-4222-8222-222222222222',
            source: 'admin_actions',
            userId: ACTOR_ID,
            userEmail: 'o***@e***',
            userRole: 'super_admin',
            targetUserRole: 'provider',
            targetProviderId: PROVIDER_ID,
            action: 'user_force_logout',
            entityType: 'user',
            entityId: PROVIDER_USER_ID,
            oldValues: null,
            newValues: { accountType: 'provider', providerId: PROVIDER_ID },
            ipAddress: null,
            userAgent: null,
            reason: 'Provider containment',
            createdAt: '2026-09-03T08:00:00.000Z',
          },
          {
            id: '33333333-3333-4333-8333-333333333333',
            source: 'admin_actions',
            userId: ACTOR_ID,
            userEmail: 'o***@e***',
            userRole: 'super_admin',
            targetUserRole: 'dpo',
            targetProviderId: null,
            action: 'staff_role_promoted_dpo',
            entityType: 'user',
            entityId: STAFF_ID,
            oldValues: null,
            newValues: { previousRole: 'admin', newRole: 'dpo' },
            ipAddress: null,
            userAgent: null,
            reason: 'DPO appointment',
            createdAt: '2026-09-03T07:00:00.000Z',
          },
        ],
        pagination: { page: 1, pageSize: 50, total: 3, totalPages: 1 },
      },
    }),
  },
}));

import AuditLogPage from '../AuditLogPage';

it('Bug UX-1068 — audit targets lead to the acted-on customer, provider, or staff account instead of the operator account', async () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const { container } = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/audit-log']}>
        <AuditLogPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );

  expect((await screen.findAllByText('User Force Logout')).length).toBeGreaterThan(0);
  expect(screen.getAllByText(/Customer account/).length).toBeGreaterThan(0);
  expect(screen.getAllByText(/Provider account/).length).toBeGreaterThan(0);
  expect(screen.getAllByText(/Staff account/).length).toBeGreaterThan(0);
  expect(container.querySelector(`a[href="/customers/${CUSTOMER_ID}"]`)).not.toBeNull();
  expect(container.querySelector(`a[href="/providers/${PROVIDER_ID}"]`)).not.toBeNull();
  expect(container.querySelector(`a[href="/staff?search=${STAFF_ID}"]`)).not.toBeNull();
  expect(container.querySelector(`a[href="/staff?search=${ACTOR_ID}"]`)).toBeNull();
});
