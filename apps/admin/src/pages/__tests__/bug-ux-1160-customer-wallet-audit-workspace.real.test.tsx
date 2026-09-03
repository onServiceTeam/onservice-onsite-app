import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const CUSTOMER_ID = '11600000-0000-4000-8000-000000001160';
const TRANSACTION_ID = '31600000-0000-4000-8000-000000001160';
const apiMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('@/lib/api', () => ({ default: apiMocks, getErrorMessage: () => 'Request failed' }));
vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));

import AuditLogPage from '../AuditLogPage';

it('Bug UX-1160 — a customer wallet audit decision opens that customer payment workspace', async () => {
  apiMocks.get.mockResolvedValue({ data: { success: true, data: [{
    id: '21600000-0000-4000-8000-000000001160',
    source: 'admin_actions',
    userId: 'admin-1',
    userEmail: 'ad***@example.com',
    userRole: 'super_admin',
    action: 'customer_credited',
    entityType: 'customer',
    entityId: CUSTOMER_ID,
    oldValues: null,
    newValues: { deltaAmount: 12500, transactionId: TRANSACTION_ID },
    ipAddress: null,
    userAgent: null,
    reason: 'Service recovery credit',
    createdAt: '2026-09-03T04:00:00.000Z',
  }], pagination: { page: 1, pageSize: 25, total: 1, totalPages: 1 } } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={client}>
      <MemoryRouter><AuditLogPage /></MemoryRouter>
    </QueryClientProvider>,
  );

  expect(await screen.findByRole('link', { name: /Open exact customer wallet transaction/ })).toHaveAttribute(
    'href',
    `/customers/${CUSTOMER_ID}?tab=payments&transactionId=${TRANSACTION_ID}`,
  );
});
