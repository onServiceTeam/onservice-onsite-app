import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';

const apiGet = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', () => ({
  default: { get: apiGet, post: vi.fn(), patch: vi.fn() },
  getErrorMessage: (error: Error) => error.message,
}));
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: { user: { role: string } }) => unknown) => selector({ user: { role: 'admin' } }),
}));

import PricingRulesPage from '../PricingRulesPage';

beforeEach(() => {
  apiGet.mockReset();
  apiGet
    .mockRejectedValueOnce(new Error('pricing source offline'))
    .mockImplementation(async (url: string) => {
      if (url === '/api/v1/admin/pricing-rules') {
        return { data: { success: true, data: [], pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 } } };
      }
      if (url === '/api/v1/catalog/admin/full') return { data: { success: true, data: [] } };
      if (url === '/api/v1/admin/service-areas') {
        return { data: { success: true, data: [], pagination: { page: 1, pageSize: 100, total: 0, totalPages: 0 } } };
      }
      throw new Error(`Unexpected request: ${url}`);
    });
});

it('Bug UX-1261 - a failed pricing-rule queue read offers an in-place retry and recovers to the empty state', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter><PricingRulesPage /></MemoryRouter>
    </QueryClientProvider>,
  );

  expect(await screen.findByRole('heading', { name: 'Pricing rules unavailable' })).toBeInTheDocument();
  expect(screen.getByText(/Do not treat this as an empty or safe-to-change queue/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Retry pricing rules' }));

  await waitFor(() => expect(apiGet).toHaveBeenCalledWith('/api/v1/admin/pricing-rules', {
    params: { page: 1, pageSize: 20 },
  }));
  expect(await screen.findByText('No pricing rules match this view')).toBeInTheDocument();
});
