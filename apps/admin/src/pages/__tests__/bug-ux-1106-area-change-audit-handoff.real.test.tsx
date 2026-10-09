import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const CHANGE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const apiMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn() }));

vi.mock('@/lib/api', () => ({ default: apiMocks, getErrorMessage: () => 'Request failed' }));
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: { user: { role: string } }) => unknown) => selector({ user: { role: 'admin' } }),
}));
vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));

import AuditLogPage from '../AuditLogPage';
import ServiceAreasPage from '../ServiceAreasPage';

it('Bug UX-1106 - an area-change audit event reopens the exact completed decision outside the pending queue', async () => {
  apiMocks.get.mockImplementation(async (url: string) => {
    if (url === '/api/v1/admin/audit-log') return { data: { data: [{
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', source: 'admin_actions', userId: 'admin-1',
      userEmail: 'o***@example.com', userRole: 'super_admin', action: 'service_area_change_approved',
      entityType: 'service_area_change_request', entityId: CHANGE_ID, oldValues: null, newValues: {},
      ipAddress: null, userAgent: null, reason: 'Verified current provider coverage', createdAt: '2026-09-03T10:00:00.000Z',
    }], pagination: { page: 1, pageSize: 50, total: 1, totalPages: 1 } } };
    if (url === `/api/v1/admin/service-area-changes/${CHANGE_ID}`) return { data: { success: true, data: {
      id: CHANGE_ID, providerId: 'provider-user-1', providerRecordId: 'provider-1', providerName: 'Cebu Home Pro',
      providerEmail: 'c***@example.com', providerPhone: '+63*******4567', currentAreaName: 'Mandaue',
      requestedAreaName: 'Cebu City', currentRadiusKm: 15, requestedRadiusKm: 25,
      requestedLatitude: 10.3157, requestedLongitude: 123.8854, reason: 'Workshop relocated.',
      status: 'approved', reviewedBy: 'admin-1', reviewedAt: '2026-09-03T10:00:00.000Z',
      decisionReason: 'Verified the provider pin and active market coverage.',
      createdAt: '2026-09-02T10:00:00.000Z', updatedAt: '2026-09-03T10:00:00.000Z',
    } } };
    if (url === '/api/v1/admin/service-area-changes') throw new Error('Pending queue unavailable');
    if (url === '/api/v1/admin/service-areas') return { data: { success: true, data: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } } };
    if (url === '/api/v1/admin/service-areas/stats') return { data: { success: true, data: { totalAreas: 0, activeAreas: 0, totalProviders: 0, totalWaitlist: 0, areasByStatus: {} } } };
    throw new Error(`Unexpected GET ${url}`);
  });

  const auditClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const audit = render(<QueryClientProvider client={auditClient}><MemoryRouter><AuditLogPage /></MemoryRouter></QueryClientProvider>);
  expect(await screen.findByRole('link', { name: /Open exact provider area-change decision/ })).toHaveAttribute('href', `/service-areas?changeRequestId=${CHANGE_ID}`);
  audit.unmount();

  const areaClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={areaClient}><MemoryRouter initialEntries={[`/service-areas?changeRequestId=${CHANGE_ID}`]}><ServiceAreasPage /></MemoryRouter></QueryClientProvider>);
  expect(await screen.findByText(CHANGE_ID)).toBeVisible();
  expect(screen.getByText('Verified the provider pin and active market coverage. · 9/3/2026, 6:00:00 PM')).toBeVisible();
  expect(screen.getByRole('link', { name: 'Cebu Home Pro' })).toHaveAttribute('href', '/providers/provider-1');
  expect(await screen.findByText('Failed to load provider service-area requests.')).toBeVisible();
});
