import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';

const BATCH_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PROVIDER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

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
        id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', source: 'admin_actions', userId: null,
        userEmail: null, userRole: null, targetProviderId: PROVIDER_ID, targetTaxYear: 2026,
        targetTaxQuarter: 3, targetTaxMonth: null, action: 'bir_2307_batch_generated',
        entityType: 'bir_2307_batch', entityId: BATCH_ID, oldValues: null, newValues: {},
        ipAddress: null, userAgent: null, reason: 'quarterly generation',
        createdAt: '2026-09-03T09:00:00.000Z',
      }], pagination: { page: 1, pageSize: 50, total: 1, totalPages: 1 },
    } };
    if (url === '/api/v1/admin/bir/overview') return { data: { data: {
      year: 2026, totalOutputVat: 0, totalVatPayable: 0, monthsFinalized: 0,
      monthlyReports: [], quarterlyBatches: [{ quarter: 3, batchCount: 1, totalWithheld: 5000 }],
    } } };
    if (url === `/api/v1/admin/bir/2307/${BATCH_ID}`) return { data: { data: {
      id: BATCH_ID, providerId: PROVIDER_ID, providerName: 'Cebu Service Co.', taxYear: 2026,
      taxQuarter: 3, grossIncome: 60000000, withholdingRate: 0.01,
      withheldAmount: 100000, pdfUrl: null, issuedAt: '2026-09-03T08:00:00.000Z',
    } } };
    if (url === '/api/v1/admin/bir/2307/quarter/2026/3') return { data: { data: { rows: [], total: 0 } } };
    throw new Error(`Unexpected GET ${url}`);
  });
});

it('Bug UX-1085 - a 2307 audit event opens the exact retained batch in the held workpaper workspace', async () => {
  const auditClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const audit = render(<QueryClientProvider client={auditClient}><MemoryRouter><AuditLogPage /></MemoryRouter></QueryClientProvider>);

  expect((await screen.findAllByText('2307 workpaper batch generated'))).toHaveLength(2);
  const expectedHref = `/financials?tab=bir&taxYear=2026&taxQuarter=3&batchId=${BATCH_ID}`;
  expect(audit.container.querySelector(`a[href="${expectedHref}"]`)).not.toBeNull();
  audit.unmount();

  routerState.search = `tab=bir&taxYear=2026&taxQuarter=3&batchId=${BATCH_ID}`;
  const financialClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={financialClient}><MemoryRouter><FinancialsPage /></MemoryRouter></QueryClientProvider>);

  expect(await screen.findByRole('heading', { name: 'Exact 2307 Workpaper Evidence' })).toBeVisible();
  expect(await screen.findByRole('link', { name: 'Cebu Service Co.' })).toHaveAttribute('href', `/providers/${PROVIDER_ID}`);
  expect(screen.getByText(BATCH_ID)).toBeVisible();
  await waitFor(() => expect(getMock).toHaveBeenCalledWith(`/api/v1/admin/bir/2307/${BATCH_ID}`));
});
