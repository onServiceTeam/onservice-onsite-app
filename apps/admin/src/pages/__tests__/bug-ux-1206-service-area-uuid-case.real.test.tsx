import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const AREA_ID = '12060000-abcd-4abc-8def-000000001206';
const apiMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn() }));

vi.mock('@/lib/api', () => ({ default: apiMocks, getErrorMessage: () => 'Request failed' }));
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: { user: { role: string } }) => unknown) => selector({ user: { role: 'admin' } }),
}));
vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));

import ServiceAreasPage from '../ServiceAreasPage';

it('Bug UX-1206 - an uppercase service-area UUID loads the canonical exact market record', async () => {
  apiMocks.get.mockImplementation(async (url: string) => {
    if (url === `/api/v1/admin/service-areas/${AREA_ID}`) return { data: { success: true, data: {
      id: AREA_ID, name: 'Canonical Metro Cebu', slug: 'metro-cebu', city: 'Cebu City', province: 'Cebu',
      region: 'Region VII', zipCodes: [], centerLat: 10.3157, centerLng: 123.8854, radiusKm: 25,
      status: 'active', launchDate: null, launchedAt: '2026-09-01T00:00:00.000Z',
      minProvidersToLaunch: 8, activeProviderCount: 12, activeCustomerCount: 145, totalBookings: 89,
      isDefault: true, createdAt: '2026-08-01T00:00:00.000Z',
    } } };
    if (url === '/api/v1/admin/service-areas') return { data: { success: true, data: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } } };
    if (url === '/api/v1/admin/service-areas/stats') return { data: { success: true, data: { totalAreas: 0, activeAreas: 0, totalProviders: 0, totalWaitlist: 0, areasByStatus: {} } } };
    if (url === '/api/v1/admin/service-area-changes') return { data: { success: true, data: [] } };
    throw new Error(`Unexpected GET ${url}`);
  });

  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[`/service-areas?areaId=${AREA_ID.toUpperCase()}`]}><ServiceAreasPage /></MemoryRouter></QueryClientProvider>);

  expect(await screen.findByText('Canonical Metro Cebu')).toBeVisible();
  expect(apiMocks.get).toHaveBeenCalledWith(`/api/v1/admin/service-areas/${AREA_ID}`);
  expect(screen.getByText(AREA_ID)).toBeVisible();
});
