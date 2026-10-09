import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('@/lib/api', () => ({ default: apiMocks, getErrorMessage: () => 'Request failed' }));

import AuditLogPage from '../AuditLogPage';

it('Bug UX-1175 — a participant-authored admin_actions row is labeled as a recorded action, not an Admin decision', async () => {
  apiMocks.get.mockResolvedValue({ data: { success: true, data: [{
    id: '11750000-0000-4000-8000-000000001175',
    source: 'admin_actions',
    userId: 'provider-user-1',
    userEmail: 'pr***@example.com',
    userRole: 'customer',
    targetProviderId: '21750000-0000-4000-8000-000000001175',
    action: 'provider_application_submitted',
    entityType: 'provider_application',
    entityId: 'provider-user-1',
    oldValues: null,
    newValues: { stepsCompleted: ['terms', 'documents'] },
    ipAddress: null,
    userAgent: null,
    reason: 'Provider submitted application for review',
    createdAt: '2026-09-03T09:00:00.000Z',
  }], pagination: { page: 1, pageSize: 25, total: 1, totalPages: 1 } } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={client}>
      <MemoryRouter><AuditLogPage /></MemoryRouter>
    </QueryClientProvider>,
  );

  expect((await screen.findAllByText('Recorded action')).length).toBeGreaterThan(0);
  expect(screen.queryByText('Admin decision')).not.toBeInTheDocument();
  expect(screen.getByRole('option', { name: 'Recorded actions' })).toHaveValue('admin_actions');
});
