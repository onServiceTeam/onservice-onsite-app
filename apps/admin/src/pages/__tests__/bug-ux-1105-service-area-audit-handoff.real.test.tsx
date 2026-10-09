import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const AREA_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const apiMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn() }));

vi.mock('@/lib/api', () => ({ default: apiMocks, getErrorMessage: () => 'Request failed' }));
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: { user: { role: string } }) => unknown) => selector({ user: { role: 'admin' } }),
}));
vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));

import AuditLogPage from '../AuditLogPage';
import ServiceAreasPage from '../ServiceAreasPage';

it('Bug UX-1105 - a market audit event opens the exact retained service area when the paginated list fails', async () => {
  apiMocks.get.mockImplementation(async (url: string) => {
    if (url === '/api/v1/admin/audit-log') return { data: { data: [{
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', source: 'admin_actions', userId: 'admin-1',
      userEmail: 'o***@example.com', userRole: 'super_admin', action: 'config_changed',
      entityType: 'service_area', entityId: AREA_ID, oldValues: null, newValues: {},
      ipAddress: null, userAgent: null, reason: 'Market capacity updated', createdAt: '2026-09-03T10:00:00.000Z',
    }], pagination: { page: 1, pageSize: 50, total: 1, totalPages: 1 } } };
    if (url === `/api/v1/admin/service-areas/${AREA_ID}`) return { data: { success: true, data: {
      id: AREA_ID, name: 'Metro Cebu', slug: 'metro-cebu', city: 'Cebu City', province: 'Cebu',
      region: 'Region VII', zipCodes: [], centerLat: 10.3157, centerLng: 123.8854, radiusKm: 25,
      status: 'active', launchDate: null, launchedAt: '2026-09-01T00:00:00.000Z',
      minProvidersToLaunch: 8, activeProviderCount: 12, activeCustomerCount: 145, totalBookings: 89,
      isDefault: true, createdAt: '2026-08-01T00:00:00.000Z',
    } } };
    if (url === '/api/v1/admin/service-areas') throw new Error('List unavailable');
    if (url === '/api/v1/admin/service-areas/stats') return { data: { success: true, data: { totalAreas: 1, activeAreas: 1, totalProviders: 12, totalWaitlist: 0, areasByStatus: { active: 1 } } } };
    if (url === '/api/v1/admin/service-area-changes') return { data: { success: true, data: [] } };
    throw new Error(`Unexpected GET ${url}`);
  });

  const auditClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const audit = render(<QueryClientProvider client={auditClient}><MemoryRouter><AuditLogPage /></MemoryRouter></QueryClientProvider>);
  expect(await screen.findByRole('link', { name: /Open exact service area/ })).toHaveAttribute('href', `/service-areas?areaId=${AREA_ID}`);
  audit.unmount();

  const areaClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={areaClient}><MemoryRouter initialEntries={[`/service-areas?areaId=${AREA_ID}`]}><ServiceAreasPage /></MemoryRouter></QueryClientProvider>);
  expect(await screen.findByText('Metro Cebu')).toBeVisible();
  expect(screen.getByText('Selected audit evidence')).toBeVisible();
  expect(screen.getByText(AREA_ID)).toBeVisible();
  expect(await screen.findByText('Failed to load service areas.')).toBeVisible();
});
