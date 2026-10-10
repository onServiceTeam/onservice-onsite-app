import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const RULE_ID = '12000000-abcd-4abc-8def-000000001200';
const apiMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn() }));

vi.mock('@/lib/api', () => ({ default: apiMocks, getErrorMessage: () => 'Request failed' }));
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: { user: { role: string } }) => unknown) => selector({ user: { role: 'admin' } }),
}));
vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));

import PricingRulesPage from '../PricingRulesPage';

it('Bug UX-1200 - a valid uppercase pricing-rule UUID loads the canonical retained rule', async () => {
  const exactRule = {
    id: RULE_ID,
    name: 'Cebu evening capacity',
    type: 'peak_hours',
    multiplier: 1.25,
    rushHoursThreshold: null,
    holidayDate: null,
    peakStartTime: '18:00:00',
    peakEndTime: '21:00:00',
    peakDaysOfWeek: [1, 2, 3, 4, 5],
    categoryId: null,
    serviceAreaId: null,
    isActive: true,
    publicationStatus: 'published',
    priority: 20,
    platformSurgeShare: 0.4,
    description: 'Published capacity rule',
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-03T10:00:00.000Z',
    publishReason: 'Validated across representative Cebu services.',
    publishedAt: '2026-09-03T10:00:00.000Z',
    retireReason: null,
    retiredAt: null,
  };
  apiMocks.get.mockImplementation(async (url: string) => {
    if (url === `/api/v1/admin/pricing-rules/${RULE_ID}`) {
      return { data: { success: true, data: exactRule } };
    }
    if (url === '/api/v1/admin/pricing-rules') {
      return { data: { success: true, data: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } } };
    }
    if (url === '/api/v1/catalog/admin/full') return { data: { success: true, data: [] } };
    if (url === '/api/v1/admin/service-areas') {
      return { data: { success: true, data: [], pagination: { page: 1, pageSize: 100, total: 0, totalPages: 0 } } };
    }
    throw new Error(`Unexpected GET ${url}`);
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/pricing-rules?ruleId=${RULE_ID.toUpperCase()}`]}>
        <PricingRulesPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );

  expect(await screen.findByText('Cebu evening capacity')).toBeVisible();
  expect(screen.getByText(RULE_ID)).toBeVisible();
  expect(screen.queryByText('The exact pricing rule could not be loaded. No other pricing rule was substituted.')).not.toBeInTheDocument();
  expect(apiMocks.get).toHaveBeenCalledWith(`/api/v1/admin/pricing-rules/${RULE_ID}`);
});
