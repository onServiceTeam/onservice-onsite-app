import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const { CUSTOMER_ID, PROVIDER_USER_ID } = vi.hoisted(() => ({
  CUSTOMER_ID: '11111111-1111-4111-8111-111111111111',
  PROVIDER_USER_ID: '22222222-2222-4222-8222-222222222222',
}));

vi.mock('@/lib/api', () => ({
  default: {
    get: vi.fn().mockResolvedValue({
      data: {
        data: [
          {
            id: '33333333-3333-4333-8333-333333333333',
            source: 'audit_log',
            userId: CUSTOMER_ID,
            userEmail: 'm***@e***',
            userRole: 'customer',
            action: 'user_profile_updated',
            entityType: 'users',
            entityId: CUSTOMER_ID,
            oldValues: { firstName: 'Maria', lastName: 'Santos' },
            newValues: { firstName: 'Maria Luisa', lastName: 'Santos' },
            ipAddress: '203.0.113.x',
            userAgent: 'Chrome on Windows',
            reason: null,
            createdAt: '2026-09-02T09:00:00.000Z',
          },
          {
            id: '44444444-4444-4444-8444-444444444444',
            source: 'audit_log',
            userId: PROVIDER_USER_ID,
            userEmail: 'p***@e***',
            userRole: 'provider',
            action: 'user_profile_updated',
            entityType: 'users',
            entityId: PROVIDER_USER_ID,
            oldValues: { firstName: 'Pedro', lastName: 'Reyes' },
            newValues: { firstName: 'Peter', lastName: 'Reyes' },
            ipAddress: '203.0.113.x',
            userAgent: 'Safari on iPad',
            reason: null,
            createdAt: '2026-09-02T08:00:00.000Z',
          },
        ],
        pagination: { page: 1, pageSize: 50, total: 2, totalPages: 1 },
      },
    }),
  },
}));

import AuditLogPage from '../AuditLogPage';

it('Bug UX-1026 — profile-name events identify the account role and lead support to customer or provider records', async () => {
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

  expect((await screen.findAllByText('Profile name updated')).length).toBeGreaterThan(0);
  expect(screen.getAllByText(/Customer account/).length).toBeGreaterThan(0);
  expect(screen.getAllByText(/Provider account/).length).toBeGreaterThan(0);
  expect(container.querySelector(`a[href="/customers/${CUSTOMER_ID}"]`)).not.toBeNull();
  expect(container.querySelector(`a[href="/providers?search=${PROVIDER_USER_ID}"]`)).not.toBeNull();
});
