import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const CATEGORY_ID = '11990000-aaaa-4abc-8def-000000001199';
const SERVICE_ID = '21990000-bbbb-4abc-8def-000000001199';
const ADDON_ID = '31990000-cccc-4abc-8def-000000001199';
const apiMocks = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock('@/lib/api', () => ({ default: { get: apiMocks.get }, getErrorMessage: () => 'Request failed' }));
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: { user: { role: string } }) => unknown) => selector({ user: { role: 'super_admin' } }),
}));
vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));

import CatalogPage from '../CatalogPage';

it('Bug UX-1199 - a valid uppercase add-on UUID selects the canonical add-on under its service', async () => {
  apiMocks.get.mockImplementation(async (url: string) => {
    if (url === '/api/v1/catalog/admin/full') return { data: { data: [{
      id: CATEGORY_ID,
      name: 'Cleaning',
      slug: 'cleaning',
      description: '',
      iconUrl: null,
      displayOrder: 1,
      subcategories: [{
        id: SERVICE_ID,
        categoryId: CATEGORY_ID,
        name: 'Deep Cleaning',
        slug: 'deep-cleaning',
        description: 'A complete customer-facing deep-cleaning service scope.',
        pricingType: 'fixed',
        basePrice: 250000,
        minPrice: null,
        maxPrice: null,
        estimatedDurationMinutes: 180,
        unitLabel: null,
        unitPrice: null,
        hourlyRate: null,
        displayOrder: 1,
        isActive: true,
      }],
    }] } };
    if (url === `/api/v1/catalog/admin/subcategories/${SERVICE_ID}/addons`) return { data: {
      data: [{
        id: ADDON_ID,
        subcategoryId: SERVICE_ID,
        name: 'Inside refrigerator',
        description: '',
        price: 45000,
        isActive: true,
        displayOrder: 1,
        exceedsCurrentPriceCap: false,
      }],
      meta: { priceCapCentavos: 5000000 },
    } };
    throw new Error(`Unexpected GET ${url}`);
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[
        `/catalog?categoryId=${CATEGORY_ID}&subcategoryId=${SERVICE_ID}&addonId=${ADDON_ID.toUpperCase()}`,
      ]}>
        <CatalogPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );

  expect(await screen.findByText('Inside refrigerator')).toBeVisible();
  expect(screen.getByText('Selected catalog record')).toBeInTheDocument();
  expect(screen.queryByText('Catalog selection unavailable')).not.toBeInTheDocument();
  expect(apiMocks.get).toHaveBeenCalledWith(`/api/v1/catalog/admin/subcategories/${SERVICE_ID}/addons`);
});
