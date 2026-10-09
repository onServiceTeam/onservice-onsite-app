import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const RATE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PROVIDER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const apiMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));

vi.mock('@/lib/api', () => ({
  default: apiMocks,
  getErrorMessage: (error: unknown) => error instanceof Error ? error.message : String(error),
}));
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { role: 'super_admin' } }),
}));
vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));

import AuditLogPage from '../AuditLogPage';
import FinancialsPage from '../FinancialsPage';

it('Bug UX-1129 - a provider-scoped commission audit event opens its exact agreement even when history fails', async () => {
  apiMocks.get.mockImplementation(async (url: string) => {
    if (url === '/api/v1/admin/audit-log') return { data: { data: [{
      id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', source: 'admin_actions',
      userId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', userEmail: 'o***@example.com',
      userRole: 'super_admin', action: 'commission_rate_scheduled', entityType: 'provider',
      entityId: PROVIDER_ID, oldValues: null, newValues: { commissionRateVersionId: RATE_ID },
      ipAddress: null, userAgent: null, reason: 'Approved provider agreement.',
      createdAt: '2026-09-03T10:00:00.000Z',
    }], pagination: { page: 1, pageSize: 50, total: 1, totalPages: 1 } } };
    if (url === `/api/v1/admin/financials/commission-controls/${RATE_ID}`) return { data: { data: {
      id: RATE_ID, scopeType: 'provider', tier: null, providerId: PROVIDER_ID,
      providerName: 'Cebu Home Care', providerTier: 'verified', serviceCategoryId: null,
      categoryName: null, serviceSubcategoryId: null, subcategoryName: null,
      rateBasisPoints: 1250, ratePercent: 12.5, effectiveFrom: '2026-10-01T00:00:00.000Z',
      reason: 'Approved provider agreement.', source: 'provider_contract',
      createdByName: 'Finance Owner', approvedByName: 'Finance Owner',
      createdAt: '2026-09-03T10:00:00.000Z', cancellation: null,
      snapshotUsageCount: 4, lifecycleStatus: 'active',
    } } };
    if (url === '/api/v1/admin/financials/commission-controls') throw new Error('History unavailable');
    if (url === '/api/v1/catalog/admin/full') return { data: { data: [] } };
    throw new Error(`Unexpected GET ${url}`);
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/audit-log']}>
        <Routes>
          <Route path="/audit-log" element={<AuditLogPage />} />
          <Route path="/financials" element={<FinancialsPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );

  const link = await screen.findByRole('link', { name: /Open exact commission agreement/ });
  expect(link).toHaveAttribute('href', `/financials?tab=commission&commissionRateId=${RATE_ID}`);
  fireEvent.click(link);

  expect(await screen.findByText('Selected commission agreement evidence')).toBeVisible();
  expect(screen.getByText(RATE_ID)).toBeVisible();
  expect(screen.getByText('12.50%')).toBeVisible();
  expect(screen.getByRole('link', { name: 'Cebu Home Care' })).toHaveAttribute('href', `/providers/${PROVIDER_ID}`);
  expect(await screen.findByText('Commission agreement history unavailable')).toBeVisible();
});
