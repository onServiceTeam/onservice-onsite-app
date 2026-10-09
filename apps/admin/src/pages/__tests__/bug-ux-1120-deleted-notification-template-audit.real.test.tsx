import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const TEMPLATE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const apiMocks = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock('@/lib/api', () => ({ default: apiMocks, getErrorMessage: () => 'Request failed' }));

import AuditLogPage from '../AuditLogPage';

it('Bug UX-1120 - a deleted notification template stays identified by its audit snapshot without a dead record link', async () => {
  apiMocks.get.mockResolvedValue({ data: { data: [{
    id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', source: 'admin_actions', userId: 'admin-1',
    userEmail: 'o***@example.com', userRole: 'super_admin', action: 'config_changed',
    entityType: 'notification_template', entityId: TEMPLATE_ID, oldValues: null,
    newValues: {
      op: 'delete', slug: 'legacy_sms', deletedTitleTemplate: 'Legacy title',
      deletedBodyTemplate: 'Retained deleted copy', reason: 'Obsolete reference copy.',
    },
    ipAddress: null, userAgent: null, reason: null, createdAt: '2026-09-03T10:00:00.000Z',
  }], pagination: { page: 1, pageSize: 50, total: 1, totalPages: 1 } } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(<QueryClientProvider client={client}><MemoryRouter><AuditLogPage /></MemoryRouter></QueryClientProvider>);

  expect((await screen.findAllByText(/Deleted notification template/)).length).toBeGreaterThan(0);
  expect(screen.queryByRole('link', { name: /notification template record/i })).not.toBeInTheDocument();
});
