import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const RATE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const apiMocks = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/lib/api', () => ({ default: apiMocks, getErrorMessage: () => 'Request failed' }));
vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));

import AuditLogPage from '../AuditLogPage';

it('Bug UX-1130 - a tier commission config event uses its exact version ID instead of System Settings', async () => {
  apiMocks.get.mockResolvedValueOnce({ data: { data: [{
    id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', source: 'admin_actions', userId: 'admin-1',
    userEmail: 'o***@example.com', userRole: 'super_admin', action: 'commission_rate_cancelled',
    entityType: 'config', entityId: RATE_ID, oldValues: null,
    newValues: { commissionRateVersionId: RATE_ID }, ipAddress: null, userAgent: null,
    reason: 'Future tier agreement cancelled.', createdAt: '2026-09-03T10:00:00.000Z',
  }], pagination: { page: 1, pageSize: 50, total: 1, totalPages: 1 } } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(<QueryClientProvider client={client}><MemoryRouter><AuditLogPage /></MemoryRouter></QueryClientProvider>);

  expect(await screen.findAllByText('Commission agreement cancelled')).toHaveLength(2);
  expect(screen.getByRole('link', { name: /Open exact commission agreement/ })).toHaveAttribute(
    'href', `/financials?tab=commission&commissionRateId=${RATE_ID}`,
  );
  expect(screen.queryByRole('link', { name: 'Open System Settings' })).not.toBeInTheDocument();
});
