import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const AUDIT_REPORT_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const DIFFERENT_REPORT_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const apiMocks = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/lib/api', () => ({
  default: { get: apiMocks.get, post: vi.fn() },
  getErrorMessage: (error: unknown) => String(error),
}));
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: { user: { role: string } }) => unknown) => (
    selector({ user: { role: 'super_admin' } })
  ),
}));
vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));

import FinancialsPage from '../FinancialsPage';

it('Bug UX-1088 - a VAT period result with a different immutable ID is refused as audit evidence', async () => {
  apiMocks.get.mockImplementation(async (url: string) => {
    if (url === '/api/v1/admin/bir/overview') return { data: { data: {
      year: 2026, totalOutputVat: 0, totalVatPayable: 0, monthsFinalized: 0,
      monthlyReports: [], quarterlyBatches: [],
    } } };
    if (url === '/api/v1/admin/bir/vat/reports/2026/8') return { data: { data: {
      id: DIFFERENT_REPORT_ID, periodYear: 2026, periodMonth: 8, totalGrossSales: 0,
      outputVat: 0, inputVat: 0, vatPayable: 0, orCount: 0, pdfUrl: null,
      finalizedAt: null, generatedAt: '2026-09-03T08:00:00.000Z',
    } } };
    throw new Error(`Unexpected GET ${url}`);
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/financials?tab=bir&taxYear=2026&vatMonth=8&vatReportId=${AUDIT_REPORT_ID}`]}>
        <FinancialsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );

  expect(await screen.findByText('VAT workpaper identity mismatch')).toBeVisible();
  expect(screen.getByText(/does not match the audit target/i)).toBeVisible();
  expect(screen.queryByText(DIFFERENT_REPORT_ID)).not.toBeInTheDocument();
});
