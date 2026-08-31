import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const apiGet = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', () => ({ default: { get: apiGet, post: vi.fn(), patch: vi.fn() }, getErrorMessage: () => 'Request failed' }));
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { role: 'admin' } }),
}));
vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));

import ServiceAreasPage from '../ServiceAreasPage';

it('Bug UX-774 — ordinary admins inspect market linkage without controls the server rejects', async () => {
  apiGet.mockImplementation(async (url: string) => {
    if (url.endsWith('/stats')) return { data: { success: true, data: {
      totalAreas: 1, activeAreas: 1, totalProviders: 5, totalWaitlist: 2, pendingWaitlist: 1, waitlistNotified: 1, areasByStatus: { active: 1 },
    } } };
    if (url.endsWith('/service-area-changes')) return { data: { success: true, data: [] } };
    return { data: { success: true, data: [{
      id: 'area-1', name: 'Metro Cebu', slug: 'metro-cebu', city: 'Cebu City', province: 'Cebu', region: 'Region VII',
      zipCodes: [], centerLat: 10.3157, centerLng: 123.8854, radiusKm: 25, status: 'active', launchDate: null,
      launchedAt: '2026-08-01T00:00:00.000Z', minProvidersToLaunch: 5, activeProviderCount: 5,
      activeCustomerCount: 20, totalBookings: 15, isDefault: false, createdAt: '2026-08-01T00:00:00.000Z',
    }], pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 } } };
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(<QueryClientProvider client={client}><MemoryRouter><ServiceAreasPage /></MemoryRouter></QueryClientProvider>);

  expect(await screen.findByText('Read-only market access')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Add Area' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Edit service area Metro Cebu' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Pause service area Metro Cebu' })).not.toBeInTheDocument();
  expect(await screen.findByRole('link', { name: 'Open providers assigned to Metro Cebu' })).toHaveAttribute('href', '/providers?serviceAreaId=area-1&status=approved');
});
