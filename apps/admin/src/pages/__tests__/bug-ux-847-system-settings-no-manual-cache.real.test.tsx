import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn(), post: vi.fn() }));
vi.mock('@/lib/api', () => ({ default: apiMocks, getErrorMessage: () => 'Request failed' }));
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { role: 'super_admin' } }),
}));

import SystemSettingsPage from '../SystemSettingsPage';

it('Bug UX-847 — System Settings does not offer a manual cache action that can falsely report success', async () => {
  apiMocks.get.mockResolvedValueOnce({
    data: { data: { categories: [{ category: 'auth', count: 0 }], settings: { auth: [] } } },
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter><SystemSettingsPage /></MemoryRouter>
    </QueryClientProvider>,
  );

  expect(await screen.findByRole('heading', { name: 'System Settings' })).toBeVisible();
  expect(screen.queryByRole('button', { name: /flush cache/i })).not.toBeInTheDocument();
  expect(apiMocks.post).not.toHaveBeenCalledWith('/api/v1/admin/settings/cache/flush');
});
