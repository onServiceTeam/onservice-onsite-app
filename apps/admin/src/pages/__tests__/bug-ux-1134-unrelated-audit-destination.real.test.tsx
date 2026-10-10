import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/lib/api', () => ({ default: apiMocks, getErrorMessage: () => 'Request failed' }));
vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));

import AuditLogPage from '../AuditLogPage';

it('Bug UX-1134 - unrelated system and unknown config events do not falsely link to System Settings', async () => {
  apiMocks.get.mockResolvedValueOnce({ data: { data: [
    {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', source: 'admin_actions', userId: 'admin-1',
      userEmail: 'o***@example.com', userRole: 'super_admin', action: 'pii_reveal',
      entityType: 'system', entityId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', oldValues: null,
      newValues: { audit_log_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' }, ipAddress: null,
      userAgent: null, reason: 'Investigating a documented privacy request.', createdAt: '2026-09-03T10:00:00.000Z',
    },
    {
      id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', source: 'admin_actions', userId: 'admin-1',
      userEmail: 'o***@example.com', userRole: 'super_admin', action: 'future_config_event',
      entityType: 'config', entityId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', oldValues: null,
      newValues: {}, ipAddress: null, userAgent: null, reason: 'Unknown retained configuration event.',
      createdAt: '2026-09-03T09:00:00.000Z',
    },
  ], pagination: { page: 1, pageSize: 50, total: 2, totalPages: 1 } } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(<QueryClientProvider client={client}><MemoryRouter><AuditLogPage /></MemoryRouter></QueryClientProvider>);

  expect(await screen.findAllByText('Private information revealed')).toHaveLength(2);
  expect(screen.getAllByText('Future Config Event')).toHaveLength(2);
  expect(screen.queryByRole('link', { name: 'Open System Settings' })).not.toBeInTheDocument();
});
