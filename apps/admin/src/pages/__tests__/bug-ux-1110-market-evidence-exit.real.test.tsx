import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const AREA_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const apiMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn() }));

vi.mock('@/lib/api', () => ({ default: apiMocks, getErrorMessage: () => 'Request failed' }));
vi.mock('@/stores/auth.store', () => ({ useAuthStore: (selector: (state: { user: { role: string } }) => unknown) => selector({ user: { role: 'admin' } }) }));
vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));

import ServiceAreasPage from '../ServiceAreasPage';

function LocationEvidence(): React.ReactElement {
  return <output aria-label="Current market query">{useLocation().search}</output>;
}

it('Bug UX-1110 - clearing exact market evidence removes only audit target IDs and preserves filters', async () => {
  apiMocks.get.mockImplementation(async (url: string) => {
    if (url === `/api/v1/admin/service-areas/${AREA_ID}`) return { data: { success: true, data: {
      id: AREA_ID, name: 'Metro Cebu', slug: 'metro-cebu', city: 'Cebu City', province: 'Cebu', region: 'Region VII',
      zipCodes: [], centerLat: 10.3157, centerLng: 123.8854, radiusKm: 25, status: 'active', launchDate: null,
      launchedAt: null, minProvidersToLaunch: 8, activeProviderCount: 12, activeCustomerCount: 10,
      totalBookings: 5, isDefault: true, createdAt: '2026-09-01T00:00:00.000Z',
    } } };
    if (url === '/api/v1/admin/service-areas') return { data: { success: true, data: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } } };
    if (url === '/api/v1/admin/service-areas/stats') return { data: { success: true, data: { totalAreas: 1, activeAreas: 1, totalProviders: 12, totalWaitlist: 0, areasByStatus: { active: 1 } } } };
    if (url === '/api/v1/admin/service-area-changes') return { data: { success: true, data: [] } };
    throw new Error(`Unexpected GET ${url}`);
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[`/service-areas?areaId=${AREA_ID}&status=active`]}><LocationEvidence /><ServiceAreasPage /></MemoryRouter></QueryClientProvider>);
  expect(await screen.findByText(AREA_ID)).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Clear selection' }));
  expect(screen.queryByText('Selected audit evidence')).not.toBeInTheDocument();
  expect(screen.getByLabelText('Current market query')).toHaveTextContent('?status=active');
});
