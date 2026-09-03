import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn() }));

vi.mock('@/lib/api', () => ({ default: apiMocks, getErrorMessage: () => 'Request failed' }));
vi.mock('@/stores/auth.store', () => ({ useAuthStore: (selector: (state: { user: { role: string } }) => unknown) => selector({ user: { role: 'admin' } }) }));
vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));

import ServiceAreasPage from '../ServiceAreasPage';

it('Bug UX-1108 - a malformed market audit ID is rejected without requesting an arbitrary detail route', async () => {
  apiMocks.get.mockImplementation(async (url: string) => {
    if (url === '/api/v1/admin/service-areas') return { data: { success: true, data: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } } };
    if (url === '/api/v1/admin/service-areas/stats') return { data: { success: true, data: { totalAreas: 0, activeAreas: 0, totalProviders: 0, totalWaitlist: 0, areasByStatus: {} } } };
    if (url === '/api/v1/admin/service-area-changes') return { data: { success: true, data: [] } };
    throw new Error(`Unexpected GET ${url}`);
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={['/service-areas?changeRequestId=not-a-request']}><ServiceAreasPage /></MemoryRouter></QueryClientProvider>);
  expect(await screen.findByText('The audit link must contain one valid service-area or change-request ID. No market record was loaded.')).toBeVisible();
  expect(apiMocks.get).not.toHaveBeenCalledWith('/api/v1/admin/service-area-changes/not-a-request');
});
