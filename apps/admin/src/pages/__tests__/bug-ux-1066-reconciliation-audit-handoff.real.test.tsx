import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';

const SNAPSHOT_ID = '16600000-0000-4000-8000-000000001066';

const { getMock, routerState, setSearchParamsMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  routerState: { search: '' },
  setSearchParamsMock: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  default: { get: getMock, post: vi.fn() },
  getErrorMessage: (error: unknown) => String(error),
}));

vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: { user: { role: string } }) => unknown) => (
    selector({ user: { role: 'super_admin' } })
  ),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('react-router-dom');
  return {
    ...actual,
    useSearchParams: () => [new URLSearchParams(routerState.search), setSearchParamsMock],
  };
});

import AuditLogPage from '../AuditLogPage';
import FinancialsPage from '../FinancialsPage';

beforeEach(() => {
  getMock.mockReset();
  setSearchParamsMock.mockReset();
  routerState.search = '';
  getMock.mockImplementation(async (url: string) => {
    if (url === '/api/v1/admin/audit-log') {
      return {
        data: {
          data: [{
            id: '26600000-0000-4000-8000-000000001066',
            source: 'admin_actions',
            userId: '36600000-0000-4000-8000-000000001066',
            userEmail: 'f***@o***',
            userRole: 'super_admin',
            action: 'reconciliation_alert_acknowledged',
            entityType: 'reconciliation',
            entityId: SNAPSHOT_ID,
            oldValues: null,
            newValues: { snapshotDate: '2026-09-03', discrepancy: 42000 },
            ipAddress: null,
            userAgent: null,
            reason: 'Matched the external settlement statement.',
            createdAt: '2026-09-03T06:00:00.000Z',
          }],
          pagination: { page: 1, pageSize: 50, total: 1, totalPages: 1 },
        },
      };
    }
    if (url === `/api/v1/admin/bir/reconciliation/${SNAPSHOT_ID}`) {
      return {
        data: {
          success: true,
          data: {
            id: SNAPSHOT_ID,
            snapshotDate: '2026-09-03',
            paymongoBalance: 1_000_000,
            expectedTotal: 958_000,
            discrepancy: 42_000,
            discrepancyAlertSent: false,
          },
        },
      };
    }
    throw new Error(`Unexpected GET ${url}`);
  });
});

it('Bug UX-1066 - a reconciliation audit event opens its exact retained snapshot evidence', async () => {
  const auditClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const audit = render(
    <QueryClientProvider client={auditClient}>
      <MemoryRouter><AuditLogPage /></MemoryRouter>
    </QueryClientProvider>,
  );

  expect((await screen.findAllByText('Reconciliation alert acknowledged'))).toHaveLength(2);
  expect(audit.container.querySelector(
    `a[href="/financials?tab=reconciliation&snapshotId=${SNAPSHOT_ID}"]`,
  )).not.toBeNull();
  audit.unmount();

  routerState.search = `tab=reconciliation&snapshotId=${SNAPSHOT_ID}`;
  const financialClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(
    <QueryClientProvider client={financialClient}>
      <MemoryRouter><FinancialsPage /></MemoryRouter>
    </QueryClientProvider>,
  );

  expect(await screen.findByRole('heading', { name: 'Exact Reconciliation Snapshot' })).toBeVisible();
  expect((await screen.findAllByText(`Snapshot ${SNAPSHOT_ID}`)).length).toBeGreaterThanOrEqual(1);
  await waitFor(() => {
    expect(getMock).toHaveBeenCalledWith(`/api/v1/admin/bir/reconciliation/${SNAPSHOT_ID}`);
  });
  expect(getMock).not.toHaveBeenCalledWith(
    '/api/v1/admin/bir/reconciliation/recent',
    expect.anything(),
  );
});
