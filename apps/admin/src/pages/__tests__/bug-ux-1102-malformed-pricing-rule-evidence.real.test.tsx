import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn() }));

vi.mock('@/lib/api', () => ({ default: apiMocks, getErrorMessage: () => 'Request failed' }));
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: { user: { role: string } }) => unknown) => selector({ user: { role: 'admin' } }),
}));
vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));

import PricingRulesPage from '../PricingRulesPage';

it('Bug UX-1102 - a malformed pricing-rule audit ID fails closed without requesting an arbitrary record', async () => {
  apiMocks.get.mockImplementation(async (url: string) => {
    if (url === '/api/v1/admin/pricing-rules') return { data: { success: true, data: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } } };
    if (url === '/api/v1/catalog/admin/full') return { data: { success: true, data: [] } };
    if (url === '/api/v1/admin/service-areas') return { data: { success: true, data: [], pagination: { page: 1, pageSize: 100, total: 0, totalPages: 0 } } };
    throw new Error(`Unexpected GET ${url}`);
  });

  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/pricing-rules?ruleId=not-a-rule']}><PricingRulesPage /></MemoryRouter>
    </QueryClientProvider>,
  );

  expect(await screen.findByText('The audit link contains an invalid pricing-rule ID. No pricing record was loaded.')).toBeVisible();
  await waitFor(() => expect(apiMocks.get).toHaveBeenCalledWith('/api/v1/admin/pricing-rules', expect.anything()));
  expect(apiMocks.get).not.toHaveBeenCalledWith('/api/v1/admin/pricing-rules/not-a-rule');
});
