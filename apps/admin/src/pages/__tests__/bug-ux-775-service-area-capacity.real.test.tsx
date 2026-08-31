import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import api from '@/lib/api';
import ServiceAreasPage from '../ServiceAreasPage';

beforeEach(() => {
  vi.mocked(api.get).mockReset().mockImplementation(async (url: string) => {
    if (url.endsWith('/stats')) return { data: { success: true, data: {
      totalAreas: 1, activeAreas: 0, totalProviders: 3, totalWaitlist: 0, pendingWaitlist: 0, waitlistNotified: 0, areasByStatus: { recruiting: 1 },
    } } } as never;
    if (url.endsWith('/service-area-changes')) return { data: { success: true, data: [] } } as never;
    return { data: { success: true, data: [{
      id: 'area-1', name: 'Davao Metro', slug: 'davao-metro', city: 'Davao City', province: 'Davao del Sur', region: 'Region XI',
      zipCodes: [], centerLat: 7.0731, centerLng: 125.6128, radiusKm: 20, status: 'recruiting', launchDate: null,
      launchedAt: null, minProvidersToLaunch: 5, activeProviderCount: 3, activeCustomerCount: 0, totalBookings: 0,
      isDefault: false, createdAt: '2026-08-01T00:00:00.000Z',
    }], pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 } } } as never;
  });
});

it('Bug UX-775 — launch controls explain and block a market below its configured provider floor', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><MemoryRouter><ServiceAreasPage /></MemoryRouter></QueryClientProvider>);

  const control = await screen.findByRole('button', {
    name: 'Cannot activate service area Davao Metro; 2 more approved providers required',
  });
  expect(control).toBeDisabled();
  expect(control).toHaveTextContent('Supply below minimum');
});
