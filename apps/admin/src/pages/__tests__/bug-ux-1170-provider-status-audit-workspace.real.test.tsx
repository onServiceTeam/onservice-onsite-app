import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const PROVIDER_ID = '11700000-0000-4000-8000-000000001170';
const ADMIN_ACTION_ID = '21700000-0000-4000-8000-000000001170';
const apiMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('@/lib/api', () => ({ default: apiMocks, getErrorMessage: () => 'Request failed' }));
vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));

import AuditLogPage from '../AuditLogPage';

it('Bug UX-1170 — a provider status audit decision opens the exact Provider 360 activity row', async () => {
  apiMocks.get.mockResolvedValue({ data: { success: true, data: [{
    id: ADMIN_ACTION_ID,
    source: 'admin_actions',
    userId: 'admin-1',
    userEmail: 'ad***@example.com',
    userRole: 'super_admin',
    action: 'provider_suspended',
    entityType: 'provider',
    entityId: PROVIDER_ID,
    oldValues: null,
    newValues: { inFlightBookingsFlagged: 2 },
    ipAddress: null,
    userAgent: null,
    reason: 'Identity risk investigation',
    createdAt: '2026-09-03T08:00:00.000Z',
  }], pagination: { page: 1, pageSize: 25, total: 1, totalPages: 1 } } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={client}>
      <MemoryRouter><AuditLogPage /></MemoryRouter>
    </QueryClientProvider>,
  );

  expect(await screen.findByRole('link', { name: /Open exact provider account decision/ })).toHaveAttribute(
    'href',
    `/providers/${PROVIDER_ID}?tab=activity&adminActionId=${ADMIN_ACTION_ID}`,
  );
});
