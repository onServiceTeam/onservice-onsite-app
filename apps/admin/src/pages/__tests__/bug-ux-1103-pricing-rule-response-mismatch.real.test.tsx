import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const RULE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER_RULE_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const apiMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn() }));

vi.mock('@/lib/api', () => ({ default: apiMocks, getErrorMessage: () => 'Request failed' }));
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: { user: { role: string } }) => unknown) => selector({ user: { role: 'admin' } }),
}));
vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));

import PricingRulesPage from '../PricingRulesPage';

it('Bug UX-1103 - a mismatched exact pricing response is rejected instead of substituting another rule', async () => {
  const otherRule = {
    id: OTHER_RULE_ID, name: 'Wrong pricing rule', type: 'rush', multiplier: 1.5,
    rushHoursThreshold: 3, holidayDate: null, peakStartTime: null, peakEndTime: null,
    peakDaysOfWeek: null, categoryId: null, serviceAreaId: null, isActive: false,
    publicationStatus: 'draft', priority: 0, platformSurgeShare: 0.5, description: '',
    createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z',
    publishReason: null, publishedAt: null, retireReason: null, retiredAt: null,
  };
  apiMocks.get.mockImplementation(async (url: string) => {
    if (url === `/api/v1/admin/pricing-rules/${RULE_ID}`) return { data: { success: true, data: otherRule } };
    if (url === '/api/v1/admin/pricing-rules') return { data: { success: true, data: [otherRule], pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 } } };
    if (url === '/api/v1/catalog/admin/full') return { data: { success: true, data: [] } };
    if (url === '/api/v1/admin/service-areas') return { data: { success: true, data: [], pagination: { page: 1, pageSize: 100, total: 0, totalPages: 0 } } };
    throw new Error(`Unexpected GET ${url}`);
  });

  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/pricing-rules?ruleId=${RULE_ID}`]}><PricingRulesPage /></MemoryRouter>
    </QueryClientProvider>,
  );

  expect(await screen.findByText('The exact pricing rule could not be loaded. No other pricing rule was substituted.')).toBeVisible();
  expect(screen.queryByText(OTHER_RULE_ID)).not.toBeInTheDocument();
  expect(screen.getAllByText('Wrong pricing rule')).toHaveLength(2);
});
