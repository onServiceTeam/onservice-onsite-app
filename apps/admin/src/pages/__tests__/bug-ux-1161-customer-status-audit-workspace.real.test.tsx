import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const CUSTOMER_ID = '11610000-0000-4000-8000-000000001161';
const apiMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('@/lib/api', () => ({ default: apiMocks, getErrorMessage: () => 'Request failed' }));
vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));

import AuditLogPage from '../AuditLogPage';

it('Bug UX-1161 — a customer status audit decision opens that customer account activity workspace', async () => {
  apiMocks.get.mockResolvedValue({ data: { success: true, data: [{
    id: '21610000-0000-4000-8000-000000001161',
    source: 'admin_actions',
    userId: 'admin-1',
    userEmail: 'ad***@example.com',
    userRole: 'super_admin',
    action: 'customer_suspended',
    entityType: 'customer',
    entityId: CUSTOMER_ID,
    oldValues: null,
    newValues: { isActive: false },
    ipAddress: null,
    userAgent: null,
    reason: 'Account takeover investigation',
    createdAt: '2026-09-03T05:00:00.000Z',
  }], pagination: { page: 1, pageSize: 25, total: 1, totalPages: 1 } } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={client}>
      <MemoryRouter><AuditLogPage /></MemoryRouter>
    </QueryClientProvider>,
  );

  expect(await screen.findByRole('link', { name: /Open customer account activity/ })).toHaveAttribute(
    'href',
    `/customers/${CUSTOMER_ID}?tab=activity`,
  );
});
