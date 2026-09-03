import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const ENTRY_ID = '12120000-abcd-4abc-8def-000000001212';
const apiMocks = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock('@/lib/api', () => ({
  default: apiMocks,
  getErrorMessage: (error: Error) => error.message,
}));
vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));

import AuditLogPage from '../AuditLogPage';

it('Bug UX-1212 - an uppercase exact audit-entry UUID matches the canonical server record', async () => {
  apiMocks.get.mockResolvedValue({ data: { data: [{
    id: ENTRY_ID,
    source: 'admin_actions',
    userId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    userEmail: 'operator@example.test',
    userRole: 'super_admin',
    action: 'booking_cancelled',
    entityType: 'booking',
    entityId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    oldValues: null,
    newValues: { status: 'cancelled' },
    ipAddress: null,
    userAgent: null,
    reason: 'Customer requested cancellation.',
    createdAt: '2026-09-04T00:00:00.000Z',
  }], pagination: { page: 1, pageSize: 50, total: 1, totalPages: 1 } } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/audit-log?source=admin_actions&entryId=${ENTRY_ID.toUpperCase()}`]}>
        <AuditLogPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );

  expect(await screen.findByRole('heading', { name: 'Booking cancelled' })).toBeVisible();
  expect(screen.queryByText(/server response did not match/i)).not.toBeInTheDocument();
  expect(apiMocks.get).toHaveBeenCalledWith(
    '/api/v1/admin/audit-log',
    { params: expect.objectContaining({ entryId: ENTRY_ID, source: 'admin_actions' }) },
  );
});
