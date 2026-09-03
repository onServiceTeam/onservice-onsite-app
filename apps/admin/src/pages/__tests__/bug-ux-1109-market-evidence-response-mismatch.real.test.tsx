import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const REQUESTED_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const apiMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn() }));

vi.mock('@/lib/api', () => ({ default: apiMocks, getErrorMessage: () => 'Request failed' }));
vi.mock('@/stores/auth.store', () => ({ useAuthStore: (selector: (state: { user: { role: string } }) => unknown) => selector({ user: { role: 'admin' } }) }));
vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));

import ServiceAreasPage from '../ServiceAreasPage';

it('Bug UX-1109 - a mismatched service-area response is rejected instead of substituting the list record', async () => {
  const otherArea = {
    id: OTHER_ID, name: 'Wrong market', slug: 'wrong-market', city: 'Davao City', province: 'Davao del Sur',
    region: 'Region XI', zipCodes: [], centerLat: 7.0731, centerLng: 125.6128, radiusKm: 20,
    status: 'planned', launchDate: null, launchedAt: null, minProvidersToLaunch: 5,
    activeProviderCount: 0, activeCustomerCount: 0, totalBookings: 0, isDefault: false,
    createdAt: '2026-09-01T00:00:00.000Z',
  };
  apiMocks.get.mockImplementation(async (url: string) => {
    if (url === `/api/v1/admin/service-areas/${REQUESTED_ID}`) return { data: { success: true, data: otherArea } };
    if (url === '/api/v1/admin/service-areas') return { data: { success: true, data: [otherArea], pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 } } };
    if (url === '/api/v1/admin/service-areas/stats') return { data: { success: true, data: { totalAreas: 1, activeAreas: 0, totalProviders: 0, totalWaitlist: 0, areasByStatus: { planned: 1 } } } };
    if (url === '/api/v1/admin/service-area-changes') return { data: { success: true, data: [] } };
    throw new Error(`Unexpected GET ${url}`);
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[`/service-areas?areaId=${REQUESTED_ID}`]}><ServiceAreasPage /></MemoryRouter></QueryClientProvider>);
  expect(await screen.findByText('The exact service area could not be loaded. No other market was substituted.')).toBeVisible();
  expect(screen.queryByText(OTHER_ID)).not.toBeInTheDocument();
  expect(screen.getAllByText('Wrong market').length).toBeGreaterThan(0);
});
