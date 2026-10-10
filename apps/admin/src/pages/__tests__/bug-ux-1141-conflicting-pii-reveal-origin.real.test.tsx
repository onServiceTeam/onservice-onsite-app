import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/lib/api', () => ({ default: apiMocks, getErrorMessage: () => 'Request failed' }));
vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));

import AuditLogPage from '../AuditLogPage';

it('Bug UX-1141 - conflicting retained PII reveal origin IDs do not create a forensic link', async () => {
  apiMocks.get.mockResolvedValueOnce({ data: { data: [{
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', source: 'admin_actions',
    userId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', userEmail: 'o***@example.com',
    userRole: 'super_admin', action: 'pii_reveal', entityType: 'system',
    entityId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', oldValues: null,
    newValues: { audit_log_id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd' },
    ipAddress: null, userAgent: null, reason: 'Investigating a documented privacy request.',
    createdAt: '2026-09-03T10:00:00.000Z',
  }], pagination: { page: 1, pageSize: 50, total: 1, totalPages: 1 } } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={client}>
      <MemoryRouter><AuditLogPage /></MemoryRouter>
    </QueryClientProvider>,
  );

  expect(await screen.findAllByText('Private information revealed')).toHaveLength(2);
  expect(screen.queryByRole('link', { name: /Open exact original masked audit event/ }))
    .not.toBeInTheDocument();
});
