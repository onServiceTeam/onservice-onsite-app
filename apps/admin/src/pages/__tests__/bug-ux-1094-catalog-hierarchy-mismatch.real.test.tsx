import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const CATEGORY_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER_CATEGORY_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const SERVICE_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const apiMocks = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock('@/lib/api', () => ({ default: { get: apiMocks.get }, getErrorMessage: () => 'Request failed' }));
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: { user: { role: string } }) => unknown) => selector({ user: { role: 'super_admin' } }),
}));
vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));

import CatalogPage from '../CatalogPage';

it('Bug UX-1094 - a catalog evidence link cannot mark a service that belongs to a different category', async () => {
  apiMocks.get.mockImplementation(async (url: string) => {
    if (url === '/api/v1/catalog/admin/full') return { data: { data: [
      {
        id: CATEGORY_ID, name: 'Cleaning', slug: 'cleaning', description: '', iconUrl: null,
        displayOrder: 1, subcategories: [],
      },
      {
        id: OTHER_CATEGORY_ID, name: 'Repairs', slug: 'repairs', description: '', iconUrl: null,
        displayOrder: 2, subcategories: [{
          id: SERVICE_ID, categoryId: OTHER_CATEGORY_ID, name: 'Plumbing', slug: 'plumbing',
          description: 'A complete customer-facing plumbing service scope.', pricingType: 'fixed',
          basePrice: 100000, minPrice: null, maxPrice: null, estimatedDurationMinutes: 60,
          unitLabel: null, unitPrice: null, hourlyRate: null, displayOrder: 1, isActive: true,
        }],
      },
    ] } };
    throw new Error(`Unexpected GET ${url}`);
  });

  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/catalog?categoryId=${CATEGORY_ID}&subcategoryId=${SERVICE_ID}`]}>
        <CatalogPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );

  expect(await screen.findByRole('alert')).toHaveTextContent(
    'The selected customer service does not belong to the category recorded in this link.',
  );
  expect(screen.getByRole('button', { name: 'Collapse Cleaning services' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Expand Repairs services' })).toBeVisible();
  expect(screen.queryByText('Selected catalog record')).not.toBeInTheDocument();
  expect(apiMocks.get).not.toHaveBeenCalledWith(expect.stringMatching(/\/addons$/));
});
