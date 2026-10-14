// HA-M2-225 (Milestone 2, P6-M2): the audit timeline names the admin action
// written when private request or thread media is opened (job_media_viewed,
// migration 184; job-media.service auditAdminViews) in plain words.
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('@/lib/api', () => ({ default: apiMocks, getErrorMessage: () => 'Request failed' }));

import AuditLogPage from '../AuditLogPage';

it('HA-M2-225: the audit log labels job_media_viewed as a private job media view', async () => {
  apiMocks.get.mockResolvedValue({ data: { success: true, data: [{
    id: '22500000-0000-4abc-8def-000000000225',
    source: 'admin_actions',
    userId: '32500000-0000-4abc-8def-000000000225',
    userEmail: 'su***@onservice.ph',
    userRole: 'admin',
    targetBookingId: '42500000-0000-4abc-8def-000000000225',
    action: 'job_media_viewed',
    entityType: 'booking',
    entityId: '42500000-0000-4abc-8def-000000000225',
    oldValues: null,
    newValues: { mediaIds: ['52500000-0000-4abc-8def-000000000225'] },
    ipAddress: null,
    userAgent: null,
    reason: null,
    createdAt: '2026-10-14T04:00:00.000Z',
  }], pagination: { page: 1, pageSize: 25, total: 1, totalPages: 1 } } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={client}>
      <MemoryRouter><AuditLogPage /></MemoryRouter>
    </QueryClientProvider>,
  );

  expect((await screen.findAllByText('Private job media viewed')).length).toBeGreaterThan(0);
  expect(screen.queryByText('Job Media Viewed')).not.toBeInTheDocument();
});
