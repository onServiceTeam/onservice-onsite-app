import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const PROVIDER_ID = '11760000-0000-4000-8000-000000001176';
const ADMIN_ACTION_ID = '21760000-0000-4000-8000-000000001176';
const apiMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('@/lib/api', () => ({ default: apiMocks, getErrorMessage: () => 'Request failed' }));

import AuditLogPage from '../AuditLogPage';

it('Bug UX-1176 — a provider application decision opens its exact owning Provider 360 activity row', async () => {
  apiMocks.get.mockResolvedValue({ data: { success: true, data: [{
    id: ADMIN_ACTION_ID,
    source: 'admin_actions',
    userId: 'admin-1',
    userEmail: 'ad***@example.com',
    userRole: 'admin',
    targetProviderId: PROVIDER_ID,
    action: 'provider_application_sent_back',
    entityType: 'provider_application',
    entityId: 'provider-user-1',
    oldValues: null,
    newValues: { decision: 'sent_back' },
    ipAddress: null,
    userAgent: null,
    reason: 'Document must be resubmitted',
    createdAt: '2026-09-03T09:00:00.000Z',
  }], pagination: { page: 1, pageSize: 25, total: 1, totalPages: 1 } } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={client}>
      <MemoryRouter><AuditLogPage /></MemoryRouter>
    </QueryClientProvider>,
  );

  expect(await screen.findByRole('link', { name: /Open exact provider application decision/ })).toHaveAttribute(
    'href',
    `/providers/${PROVIDER_ID}?tab=activity&adminActionId=${ADMIN_ACTION_ID}`,
  );
});
