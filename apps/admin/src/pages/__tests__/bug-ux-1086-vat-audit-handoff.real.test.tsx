import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';

const REPORT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const { getMock, routerState, setSearchParamsMock } = vi.hoisted(() => ({
  getMock: vi.fn(), routerState: { search: '' }, setSearchParamsMock: vi.fn(),
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
  return { ...actual, useSearchParams: () => [new URLSearchParams(routerState.search), setSearchParamsMock] };
});

import AuditLogPage from '../AuditLogPage';
import FinancialsPage from '../FinancialsPage';

beforeEach(() => {
  getMock.mockReset();
  setSearchParamsMock.mockReset();
  routerState.search = '';
  getMock.mockImplementation(async (url: string) => {
    if (url === '/api/v1/admin/audit-log') return { data: {
      data: [{
        id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', source: 'admin_actions',
        userId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', userEmail: 'o***@example.com',
        userRole: 'super_admin', targetTaxYear: 2026, targetTaxQuarter: null,
        targetTaxMonth: 8, action: 'vat_report_finalized', entityType: 'vat_report',
        entityId: REPORT_ID, oldValues: null, newValues: {}, ipAddress: null,
        userAgent: null, reason: 'VAT report finalized', createdAt: '2026-09-03T09:00:00.000Z',
      }], pagination: { page: 1, pageSize: 50, total: 1, totalPages: 1 },
    } };
    if (url === '/api/v1/admin/bir/overview') return { data: { data: {
      year: 2026, totalOutputVat: 120000, totalVatPayable: 100000, monthsFinalized: 1,
      monthlyReports: [{ month: 8, outputVat: 120000, vatPayable: 100000, finalized: true, pdfUrl: null }],
      quarterlyBatches: [],
    } } };
    if (url === '/api/v1/admin/bir/vat/reports/2026/8') return { data: { data: {
      id: REPORT_ID, periodYear: 2026, periodMonth: 8, totalGrossSales: 1120000,
      outputVat: 120000, inputVat: 20000, vatPayable: 100000, orCount: 14,
      pdfUrl: null, finalizedAt: '2026-09-03T08:30:00.000Z',
      generatedAt: '2026-09-03T08:00:00.000Z',
    } } };
    throw new Error(`Unexpected GET ${url}`);
  });
});

it('Bug UX-1086 - a VAT audit event opens the exact retained report and verifies its target identity', async () => {
  const auditClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const audit = render(<QueryClientProvider client={auditClient}><MemoryRouter><AuditLogPage /></MemoryRouter></QueryClientProvider>);

  expect((await screen.findAllByText('VAT workpaper locked'))).toHaveLength(2);
  const expectedHref = `/financials?tab=bir&taxYear=2026&vatMonth=8&vatReportId=${REPORT_ID}`;
  expect(audit.container.querySelector(`a[href="${expectedHref}"]`)).not.toBeNull();
  audit.unmount();

  routerState.search = `tab=bir&taxYear=2026&vatMonth=8&vatReportId=${REPORT_ID}`;
  const financialClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={financialClient}><MemoryRouter><FinancialsPage /></MemoryRouter></QueryClientProvider>);

  expect(await screen.findByRole('heading', { name: 'Exact VAT Workpaper Evidence' })).toBeVisible();
  expect(await screen.findByText(REPORT_ID)).toBeVisible();
  expect(screen.getByText('August 2026')).toBeVisible();
  expect(screen.queryByText('VAT workpaper identity mismatch')).not.toBeInTheDocument();
  await waitFor(() => expect(getMock).toHaveBeenCalledWith('/api/v1/admin/bir/vat/reports/2026/8'));
});
