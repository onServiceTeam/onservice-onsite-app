import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock('@/lib/api', () => ({ default: { get: apiMocks.get }, getErrorMessage: () => 'Request failed' }));
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: { user: { role: string } }) => unknown) => selector({ user: { role: 'super_admin' } }),
}));
vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));

import CatalogPage from '../CatalogPage';

it('Bug UX-1093 - malformed catalog evidence identifiers are rejected without opening an unrelated service hierarchy', async () => {
  apiMocks.get.mockImplementation(async (url: string) => {
    if (url === '/api/v1/catalog/admin/full') return { data: { data: [{
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'Cleaning', slug: 'cleaning',
      description: '', iconUrl: null, displayOrder: 1, subcategories: [],
    }] } };
    throw new Error(`Unexpected GET ${url}`);
  });

  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/catalog?categoryId=not-a-uuid&subcategoryId=bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb']}>
        <CatalogPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );

  expect(await screen.findByRole('alert')).toHaveTextContent('The service category ID must be a complete UUID.');
  expect(screen.getByRole('button', { name: 'Expand Cleaning services' })).toBeVisible();
  expect(screen.queryByText('Selected catalog record')).not.toBeInTheDocument();
  expect(apiMocks.get).not.toHaveBeenCalledWith(expect.stringMatching(/\/addons$/));
});
