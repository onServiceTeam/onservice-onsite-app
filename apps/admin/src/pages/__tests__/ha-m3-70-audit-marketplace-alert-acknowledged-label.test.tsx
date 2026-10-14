// HA-M3-70 (D38 Milestone 3): the audit log names the admin action written
// when an admin acknowledges a marketplace request alert
// (marketplace_alert_acknowledged, migration 186; marketplace-alert.service
// acknowledgeAlert) in plain words.
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('@/lib/api', () => ({ default: apiMocks, getErrorMessage: () => 'Request failed' }));

import AuditLogPage from '../AuditLogPage';

it('HA-M3-70: the audit log labels marketplace_alert_acknowledged as "Marketplace alert acknowledged"', async () => {
  apiMocks.get.mockResolvedValue({ data: { success: true, data: [{
    id: '27000000-0000-4abc-8def-000000000070',
    source: 'admin_actions',
    userId: '37000000-0000-4abc-8def-000000000070',
    userEmail: 'op***@onservice.ph',
    userRole: 'admin',
    targetBookingId: '47000000-0000-4abc-8def-000000000070',
    action: 'marketplace_alert_acknowledged',
    entityType: 'booking',
    entityId: '47000000-0000-4abc-8def-000000000070',
    oldValues: null,
    newValues: { alertId: '57000000-0000-4abc-8def-000000000070', kind: 'request_waiting_red', round: 1 },
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

  expect((await screen.findAllByText('Marketplace alert acknowledged')).length).toBeGreaterThan(0);
  expect(screen.queryByText('Marketplace Alert Acknowledged')).not.toBeInTheDocument();
});
