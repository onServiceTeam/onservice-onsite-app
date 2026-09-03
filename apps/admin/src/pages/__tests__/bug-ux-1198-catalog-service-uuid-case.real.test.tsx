import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const CATEGORY_ID = '11980000-aaaa-4abc-8def-000000001198';
const SERVICE_ID = '21980000-bbbb-4abc-8def-000000001198';
const apiMocks = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock('@/lib/api', () => ({ default: { get: apiMocks.get }, getErrorMessage: () => 'Request failed' }));
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: { user: { role: string } }) => unknown) => selector({ user: { role: 'super_admin' } }),
}));
vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));

import CatalogPage from '../CatalogPage';

it('Bug UX-1198 - a valid uppercase service UUID selects the canonical service under its category', async () => {
  apiMocks.get.mockResolvedValue({ data: { data: [{
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
  }] } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[
        `/catalog?categoryId=${CATEGORY_ID}&subcategoryId=${SERVICE_ID.toUpperCase()}`,
      ]}>
        <CatalogPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );

  expect(await screen.findByText('Deep Cleaning')).toBeVisible();
  expect(screen.getByText('Selected catalog record')).toBeInTheDocument();
  expect(screen.queryByText('Catalog selection unavailable')).not.toBeInTheDocument();
});
