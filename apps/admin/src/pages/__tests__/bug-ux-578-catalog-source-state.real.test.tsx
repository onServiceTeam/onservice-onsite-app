import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, it, vi } from 'vitest';

const apiGet = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', () => ({
  default: { get: apiGet, post: vi.fn(), put: vi.fn(), delete: vi.fn() },
  getErrorMessage: (error: unknown) => error instanceof Error ? error.message : 'Request failed',
}));
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { role: 'super_admin' } }),
}));

import CatalogPage from '../CatalogPage';

it('Bug UX-578 — a failed catalog source blocks operators from treating booking scope as available', async () => {
  apiGet.mockRejectedValue(new Error('Catalog source offline'));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(<QueryClientProvider client={client}><CatalogPage /></QueryClientProvider>);

  expect(await screen.findByText('Service catalog unavailable')).toBeInTheDocument();
  expect(screen.getByText(/Published booking scope and pricing cannot be verified/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Retry catalog' })).toBeEnabled();
  expect(screen.queryByRole('button', { name: /Add Category/i })).not.toBeInTheDocument();
});
