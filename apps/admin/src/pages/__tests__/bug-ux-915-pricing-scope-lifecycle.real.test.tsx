import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const apiGet = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', () => ({
  default: { get: apiGet, post: vi.fn(), patch: vi.fn() },
  getErrorMessage: (error: Error) => error.message,
}));
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { role: 'super_admin' } }),
}));

import PricingRulesPage from '../PricingRulesPage';

it('Bug UX-915 — pricing operations show explicit scope and lifecycle without unsafe enable or delete controls', async () => {
  apiGet.mockImplementation(async (url: string) => {
    if (url === '/api/v1/admin/pricing-rules') return { data: {
      success: true,
      data: [{
        id: 'rule-915', name: 'Cebu rush draft', type: 'rush', multiplier: 1.5,
        rushHoursThreshold: 3, holidayDate: null, peakStartTime: null, peakEndTime: null,
        peakDaysOfWeek: null, categoryId: null, serviceAreaId: 'area-915', isActive: false,
        publicationStatus: 'draft', priority: 20, platformSurgeShare: 0, description: 'Provider-first surge.',
        createdAt: '2026-09-02T00:00:00Z', updatedAt: '2026-09-02T00:00:00Z',
        publishReason: null, publishedAt: null, retireReason: null, retiredAt: null,
      }],
      pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
    } };
    if (url === '/api/v1/catalog/admin/full') return { data: { success: true, data: [] } };
    if (url === '/api/v1/admin/service-areas') return { data: {
      success: true,
      data: [{ id: 'area-915', name: 'Metro Cebu', city: 'Cebu City', province: 'Cebu', status: 'active' }],
      pagination: { page: 1, pageSize: 100, total: 1, totalPages: 1 },
    } };
    throw new Error(`Unexpected request: ${url}`);
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><MemoryRouter><PricingRulesPage /></MemoryRouter></QueryClientProvider>);

  expect((await screen.findAllByText('Cebu rush draft'))[0]).toBeVisible();
  expect(screen.getAllByText('All categories · Metro Cebu').length).toBeGreaterThan(0);
  expect(screen.getAllByText('Draft').length).toBeGreaterThan(0);
  expect(screen.getByText('New bookings only')).toBeVisible();
  expect(screen.queryByRole('button', { name: /enable/i })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument();
});
