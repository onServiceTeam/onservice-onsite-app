import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const ENTRY_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const apiMocks = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/lib/api', () => ({
  default: apiMocks,
  getErrorMessage: (error: unknown) => error instanceof Error ? error.message : String(error),
}));
vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));

import AuditLogPage from '../AuditLogPage';

it('Bug UX-1139 - exact audit evidence exports only the selected entry filter', async () => {
  apiMocks.get.mockImplementation(async (url: string) => {
    if (url === '/api/v1/admin/audit-log') return { data: { data: [{
      id: ENTRY_ID, source: 'audit_log', userId: null, userEmail: null, userRole: null,
      action: 'booking.status_changed', entityType: 'booking', entityId: ENTRY_ID,
      oldValues: null, newValues: null, ipAddress: null, userAgent: null, reason: null,
      createdAt: '2026-09-03T09:00:00.000Z',
    }], pagination: { page: 1, pageSize: 50, total: 1, totalPages: 1 } } };
    if (url === '/api/v1/admin/compliance/audit-log/export.csv') {
      return { data: new Blob(['masked']) };
    }
    throw new Error(`Unexpected GET ${url}`);
  });
  const createObjectUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:audit-export');
  const revokeObjectUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  const anchorClick = vi.spyOn(window.HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  try {
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[`/audit-log?source=audit_log&entryId=${ENTRY_ID}`]}>
          <AuditLogPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Export filtered CSV' }));
    await waitFor(() => {
      expect(apiMocks.get).toHaveBeenCalledWith(
        '/api/v1/admin/compliance/audit-log/export.csv',
        {
          params: expect.objectContaining({ entryId: ENTRY_ID, source: 'audit_log' }),
          responseType: 'blob',
        },
      );
    });
  } finally {
    anchorClick.mockRestore();
    createObjectUrl.mockRestore();
    revokeObjectUrl.mockRestore();
  }
});
