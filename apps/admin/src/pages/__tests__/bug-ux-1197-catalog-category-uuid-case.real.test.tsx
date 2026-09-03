import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const CATEGORY_ID = '11970000-aaaa-4abc-8def-000000001197';
const apiMocks = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock('@/lib/api', () => ({ default: { get: apiMocks.get }, getErrorMessage: () => 'Request failed' }));
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: { user: { role: string } }) => unknown) => selector({ user: { role: 'super_admin' } }),
}));
vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));

import CatalogPage from '../CatalogPage';

it('Bug UX-1197 - a valid uppercase category UUID selects the canonical catalog category', async () => {
  apiMocks.get.mockResolvedValue({ data: { data: [{
    id: CATEGORY_ID,
    name: 'Cleaning',
    slug: 'cleaning',
    description: '',
    iconUrl: null,
    displayOrder: 1,
    subcategories: [],
  }] } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/catalog?categoryId=${CATEGORY_ID.toUpperCase()}`]}>
        <CatalogPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );

  expect(await screen.findByRole('button', { name: 'Collapse Cleaning services' })).toBeVisible();
  expect(screen.getByText('Selected catalog record')).toBeInTheDocument();
  expect(screen.queryByText('Catalog selection unavailable')).not.toBeInTheDocument();
});
