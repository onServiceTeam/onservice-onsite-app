import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));

const { DSR_ID, apiGet } = vi.hoisted(() => ({
  DSR_ID: '00000000-0000-0000-0000-00000000abcd',
  apiGet: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  default: { get: apiGet, post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
  getErrorMessage: (error: Error) => error.message,
}));
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { role: 'super_admin' } }),
}));

import AuditLogPage from '../AuditLogPage';
import DataProtectionLogPage from '../DataProtectionLogPage';

function LocationEvidence(): React.ReactElement {
  const location = useLocation();
  return <output aria-label="Current privacy handoff query">{location.search}</output>;
}

it('Bug UX-1070 — a super-admin audit event reopens the exact authorized privacy case', async () => {
  apiGet.mockImplementation((url: string) => {
    if (url === '/api/v1/admin/audit-log') {
      return Promise.resolve({ data: {
        data: [{
          id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
          source: 'audit_log',
          userId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
          userEmail: 'd***@o***',
          userRole: 'dpo',
          action: 'dsr.status_changed',
          entityType: 'data_subject_request',
          entityId: DSR_ID,
          oldValues: { status: 'received' },
          newValues: { status: 'in_progress' },
          ipAddress: null,
          userAgent: null,
          createdAt: '2026-09-03T10:00:00.000Z',
        }],
        pagination: { page: 1, pageSize: 50, total: 1, totalPages: 1 },
      } });
    }
    if (url === `/api/v1/admin/compliance/dsr/${DSR_ID}`) {
      return Promise.resolve({ data: { data: {
        id: DSR_ID,
        userId: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
        userEmail: 'subject@example.test',
        userRole: 'customer',
        providerProfileId: null,
        requestType: 'correction',
        status: 'in_progress',
        receivedAt: '2026-09-01T00:00:00.000Z',
        dueAt: '2026-09-16T00:00:00.000Z',
        completedAt: null,
        handledBy: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        handledByName: 'Maria Santos',
        handledByEmail: 'maria@onservice.ph',
        userMessage: 'Please correct my account surname.',
        adminNotes: 'Identity evidence verified.',
        responsePayloadUrl: null,
        rejectionReason: null,
        daysUntilDue: 13,
        isOverdue: false,
      } } });
    }
    if (url.startsWith('/api/v1/admin/compliance/dsr?')) {
      return Promise.resolve({ data: { data: { rows: [], total: 0 } } });
    }
    return Promise.reject(new Error(`Unexpected request: ${url}`));
  });

  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const handoffRender = render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/audit-log']}>
        <LocationEvidence />
        <Routes>
          <Route path="/audit-log" element={<AuditLogPage />} />
          <Route path="/data-protection-log" element={<DataProtectionLogPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );

  expect((await screen.findAllByText('Data subject request status changed')).length).toBeGreaterThan(0);
  const destination = `/data-protection-log?dsrId=${DSR_ID}`;
  const destinationLink = handoffRender.container.querySelector(`a[href="${destination}"]`);
  expect(destinationLink).not.toBeNull();
  fireEvent.click(destinationLink!);

  expect(await screen.findByRole('heading', { name: 'Privacy case 0000ABCD' })).toBeVisible();
  expect(screen.getByText('Please correct my account surname.')).toBeVisible();
  expect(screen.getByLabelText('Current privacy handoff query')).toHaveTextContent(`?dsrId=${DSR_ID}`);
  expect(apiGet).toHaveBeenCalledWith(`/api/v1/admin/compliance/dsr/${DSR_ID}`);
});
