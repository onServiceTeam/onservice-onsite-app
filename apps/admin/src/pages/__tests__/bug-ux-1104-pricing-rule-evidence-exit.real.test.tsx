import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const RULE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const apiMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn() }));

vi.mock('@/lib/api', () => ({ default: apiMocks, getErrorMessage: () => 'Request failed' }));
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: { user: { role: string } }) => unknown) => selector({ user: { role: 'admin' } }),
}));
vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));

import PricingRulesPage from '../PricingRulesPage';

function LocationEvidence(): React.ReactElement {
  return <output aria-label="Current pricing query">{useLocation().search}</output>;
}

it('Bug UX-1104 - clearing exact pricing evidence removes only ruleId and preserves other workspace state', async () => {
  const rule = {
    id: RULE_ID, name: 'Selected rule', type: 'rush', multiplier: 1.2,
    rushHoursThreshold: 3, holidayDate: null, peakStartTime: null, peakEndTime: null,
    peakDaysOfWeek: null, categoryId: null, serviceAreaId: null, isActive: true,
    publicationStatus: 'published', priority: 10, platformSurgeShare: 0.5, description: '',
    createdAt: '2026-09-01T00:00:00.000Z', updatedAt: '2026-09-01T00:00:00.000Z',
    publishReason: 'Approved after controlled preview.', publishedAt: '2026-09-01T00:00:00.000Z',
    retireReason: null, retiredAt: null,
  };
  apiMocks.get.mockImplementation(async (url: string) => {
    if (url === `/api/v1/admin/pricing-rules/${RULE_ID}`) return { data: { success: true, data: rule } };
    if (url === '/api/v1/admin/pricing-rules') return { data: { success: true, data: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } } };
    if (url === '/api/v1/catalog/admin/full') return { data: { success: true, data: [] } };
    if (url === '/api/v1/admin/service-areas') return { data: { success: true, data: [], pagination: { page: 1, pageSize: 100, total: 0, totalPages: 0 } } };
    throw new Error(`Unexpected GET ${url}`);
  });

  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/pricing-rules?ruleId=${RULE_ID}&source=audit`]}>
        <LocationEvidence />
        <PricingRulesPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );

  expect(await screen.findByText(RULE_ID)).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Clear selection' }));
  expect(screen.queryByText('Selected audit evidence')).not.toBeInTheDocument();
  expect(screen.getByLabelText('Current pricing query')).toHaveTextContent('?source=audit');
});
