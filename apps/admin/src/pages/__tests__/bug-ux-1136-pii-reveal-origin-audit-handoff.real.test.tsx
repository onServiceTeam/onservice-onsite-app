import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const REVEAL_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ORIGINAL_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const BOOKING_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const apiMocks = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock('@/lib/api', () => ({
  default: apiMocks,
  getErrorMessage: (error: unknown) => error instanceof Error ? error.message : String(error),
}));
vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));

import AuditLogPage from '../AuditLogPage';

it('Bug UX-1136 - a PII reveal event opens and selects its exact original masked audit event', async () => {
  apiMocks.get.mockImplementation(async (url: string, options?: { params?: Record<string, unknown> }) => {
    if (url !== '/api/v1/admin/audit-log') throw new Error(`Unexpected GET ${url}`);
    if (options?.params?.entryId === ORIGINAL_ID) {
      return { data: { data: [{
        id: ORIGINAL_ID, source: 'audit_log', userId: null, userEmail: null, userRole: null,
        action: 'booking.status_changed', entityType: 'booking', entityId: BOOKING_ID,
        oldValues: { customerEmail: 'c***@e***' }, newValues: { status: 'in_progress' },
        ipAddress: '203.0.113.x', userAgent: 'Chrome / Windows', reason: null,
        createdAt: '2026-09-03T09:00:00.000Z',
      }], pagination: { page: 1, pageSize: 50, total: 1, totalPages: 1 } } };
    }
    return { data: { data: [{
      id: REVEAL_ID, source: 'admin_actions', userId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      userEmail: 'o***@example.com', userRole: 'super_admin', action: 'pii_reveal',
      entityType: 'system', entityId: ORIGINAL_ID, oldValues: null,
      newValues: { audit_log_id: ORIGINAL_ID }, ipAddress: null, userAgent: null,
      reason: 'Investigating a documented privacy request.', createdAt: '2026-09-03T10:00:00.000Z',
    }], pagination: { page: 1, pageSize: 50, total: 1, totalPages: 1 } } };
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });

  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/audit-log']}>
        <Routes><Route path="/audit-log" element={<AuditLogPage />} /></Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );

  const links = await screen.findAllByRole('link', { name: /Open exact original masked audit event/ });
  expect(links[0]).toHaveAttribute('href', `/audit-log?source=audit_log&entryId=${ORIGINAL_ID}`);
  fireEvent.click(links[0]!);

  expect(await screen.findByText('Exact event evidence')).toBeVisible();
  expect(await screen.findByText('Selected event')).toBeVisible();
  expect(screen.getAllByText(ORIGINAL_ID).length).toBeGreaterThan(0);
  expect(screen.getByText(/c\*\*\*@e\*\*\*/)).toBeVisible();
  await waitFor(() => {
    expect(apiMocks.get).toHaveBeenCalledWith('/api/v1/admin/audit-log', {
      params: expect.objectContaining({ entryId: ORIGINAL_ID, source: 'audit_log' }),
    });
  });
});
