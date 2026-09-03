import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const PROVIDER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const apiMocks = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/lib/api', () => ({ default: apiMocks, getErrorMessage: () => 'Request failed' }));

import AuditLogPage from '../AuditLogPage';

it('Bug UX-1083 — relationally enriched provider staff, document, and application events link back to their owning Provider 360 workspace', async () => {
  apiMocks.get.mockResolvedValue({ data: { success: true, data: [
    {
      id: '11111111-1111-4111-8111-111111111111', source: 'admin_actions', userId: 'admin-1',
      userEmail: 'ad***@example.com', userRole: 'super_admin', targetProviderId: PROVIDER_ID,
      action: 'provider_staff_suspended', entityType: 'provider_staff',
      entityId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', oldValues: null,
      newValues: { previousStatus: 'approved', nextStatus: 'suspended' }, ipAddress: null,
      userAgent: null, reason: 'Support containment', createdAt: '2026-09-03T03:00:00.000Z',
    },
    {
      id: '22222222-2222-4222-8222-222222222222', source: 'admin_actions', userId: 'admin-1',
      userEmail: 'ad***@example.com', userRole: 'super_admin', targetProviderId: PROVIDER_ID,
      action: 'provider_document_rejected', entityType: 'provider_document',
      entityId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', oldValues: null, newValues: {},
      ipAddress: null, userAgent: null, reason: 'Unreadable evidence', createdAt: '2026-09-03T02:00:00.000Z',
    },
    {
      id: '33333333-3333-4333-8333-333333333333', source: 'admin_actions', userId: 'admin-1',
      userEmail: 'ad***@example.com', userRole: 'super_admin', targetProviderId: PROVIDER_ID,
      action: 'provider_application_sent_back', entityType: 'provider_application',
      entityId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', oldValues: null, newValues: { decision: 'sent_back' },
      ipAddress: null, userAgent: null, reason: 'Application incomplete', createdAt: '2026-09-03T01:00:00.000Z',
    },
  ], pagination: { page: 1, pageSize: 25, total: 3, totalPages: 1 } } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={client}>
      <MemoryRouter><AuditLogPage /></MemoryRouter>
    </QueryClientProvider>,
  );

  expect(await screen.findByRole('link', { name: /Open provider staff/ })).toHaveAttribute(
    'to', `/providers/${PROVIDER_ID}?tab=staff`,
  );
  expect(screen.getAllByRole('link', { name: /Open Provider 360/ })).toHaveLength(2);
  for (const link of screen.getAllByRole('link', { name: /Open Provider 360/ })) {
    expect(link).toHaveAttribute('to', `/providers/${PROVIDER_ID}`);
  }
});
