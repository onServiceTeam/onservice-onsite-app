import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const CHANGE_ID = '12070000-abcd-4abc-8def-000000001207';
const apiMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn() }));

vi.mock('@/lib/api', () => ({ default: apiMocks, getErrorMessage: () => 'Request failed' }));
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: { user: { role: string } }) => unknown) => selector({ user: { role: 'admin' } }),
}));
vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));

import ServiceAreasPage from '../ServiceAreasPage';

it('Bug UX-1207 - an uppercase area-change UUID loads the canonical exact provider decision', async () => {
  apiMocks.get.mockImplementation(async (url: string) => {
    if (url === `/api/v1/admin/service-area-changes/${CHANGE_ID}`) return { data: { success: true, data: {
      id: CHANGE_ID, providerId: 'provider-user-1', providerRecordId: 'provider-1', providerName: 'Canonical Cebu Pro',
      providerEmail: 'c***@example.com', providerPhone: '+63*******4567', currentAreaName: 'Mandaue',
      requestedAreaName: 'Cebu City', currentRadiusKm: 15, requestedRadiusKm: 25,
      requestedLatitude: 10.3157, requestedLongitude: 123.8854, reason: 'Workshop relocated.',
      status: 'approved', reviewedBy: 'admin-1', reviewedAt: '2026-09-03T10:00:00.000Z',
      decisionReason: 'Canonical provider-area decision.', createdAt: '2026-09-02T10:00:00.000Z',
      updatedAt: '2026-09-03T10:00:00.000Z',
    } } };
    if (url === '/api/v1/admin/service-area-changes') return { data: { success: true, data: [] } };
    if (url === '/api/v1/admin/service-areas') return { data: { success: true, data: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } } };
    if (url === '/api/v1/admin/service-areas/stats') return { data: { success: true, data: { totalAreas: 0, activeAreas: 0, totalProviders: 0, totalWaitlist: 0, areasByStatus: {} } } };
    throw new Error(`Unexpected GET ${url}`);
  });

  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[`/service-areas?changeRequestId=${CHANGE_ID.toUpperCase()}`]}><ServiceAreasPage /></MemoryRouter></QueryClientProvider>);

  expect(await screen.findByText(CHANGE_ID)).toBeVisible();
  expect(apiMocks.get).toHaveBeenCalledWith(`/api/v1/admin/service-area-changes/${CHANGE_ID}`);
  expect(screen.getByText('Canonical provider-area decision. · 9/3/2026, 6:00:00 PM')).toBeVisible();
});
