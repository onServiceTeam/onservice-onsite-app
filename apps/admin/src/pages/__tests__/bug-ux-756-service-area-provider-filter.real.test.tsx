import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn() }));
vi.mock('@/lib/api', () => ({ default: apiMocks, getErrorMessage: () => 'Request failed' }));
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { role: 'super_admin' } }),
}));
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('react-router-dom');
  return {
    ...actual,
    useSearchParams: () => [new URLSearchParams('providerId=provider-2'), vi.fn()],
  };
});

import ServiceAreasPage from '../ServiceAreasPage';

it('Bug UX-756 — Provider 360 deep-links service-area operations to only that provider’s pending request', async () => {
  apiMocks.get.mockImplementation(async (url: string) => {
    if (url.endsWith('/stats')) return { data: { success: true, data: {
      totalAreas: 1, activeAreas: 1, totalProviders: 2, totalWaitlist: 0, areasByStatus: { active: 1 },
    } } };
    if (url.endsWith('/service-area-changes')) return { data: { success: true, data: [
      { id: 'change-1', providerId: 'user-1', providerRecordId: 'provider-1', providerName: 'Provider One',
        currentAreaName: 'Mandaue', requestedAreaName: 'Cebu City', currentRadiusKm: 10,
        requestedRadiusKm: 20, requestedLatitude: 10.3, requestedLongitude: 123.9,
        reason: 'Moved shop', createdAt: '2026-08-30T00:00:00.000Z' },
      { id: 'change-2', providerId: 'user-2', providerRecordId: 'provider-2', providerName: 'Provider Two',
        currentAreaName: 'Talisay', requestedAreaName: 'Mandaue', currentRadiusKm: 10,
        requestedRadiusKm: 15, requestedLatitude: 10.3, requestedLongitude: 123.9,
        reason: 'Moved shop', createdAt: '2026-08-30T00:00:00.000Z' },
    ] } };
    return { data: { success: true, data: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } } };
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/service-areas?providerId=provider-2']}>
        <ServiceAreasPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );

  expect(await screen.findByText('Provider Two')).toBeVisible();
  expect(screen.queryByText('Provider One')).not.toBeInTheDocument();
  expect(screen.getByText(/showing one Provider 360 record/i)).toBeVisible();
});
