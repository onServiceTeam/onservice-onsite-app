import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn().mockResolvedValue({ data: { success: true, data: {} } }),
  delete: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  default: apiMocks,
  getErrorMessage: (error: unknown) => error instanceof Error ? error.message : 'Request failed',
}));
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { role: 'super_admin' } }),
}));

import CatalogPage from '../CatalogPage';

it('Bug UX-1018 — Catalog shows grandfathered price review context and preserves price on a non-price edit', async () => {
  apiMocks.get.mockImplementation((url: string) => {
    if (url.endsWith('/addons')) {
      return Promise.resolve({
        data: {
          success: true,
          data: [{
            id: 'addon-high', subcategoryId: 'service-1', name: 'Whole-site supplies',
            description: 'Original scope', price: 12_000_000, isActive: true, displayOrder: 1,
            exceedsCurrentPriceCap: true,
          }],
          meta: { priceCapCentavos: 10_000_000 },
        },
      });
    }
    return Promise.resolve({
      data: {
        success: true,
        data: [{
          id: 'category-1', name: 'Cleaning', slug: 'cleaning', description: 'Cleaning services',
          iconUrl: null, displayOrder: 1,
          subcategories: [{
            id: 'service-1', categoryId: 'category-1', name: 'Deep cleaning', slug: 'deep-cleaning',
            description: 'Includes the agreed deep-cleaning work and important customer-facing limits.',
            pricingType: 'fixed', basePrice: 100000, minPrice: null, maxPrice: null,
            estimatedDurationMinutes: 120, unitLabel: null, unitPrice: null, hourlyRate: null,
            displayOrder: 1, isActive: true,
          }],
        }],
      },
    });
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><CatalogPage /></QueryClientProvider>);

  fireEvent.click(await screen.findByRole('button', { name: 'Expand Cleaning services' }));
  fireEvent.click(screen.getByRole('button', { name: 'Show add-ons for Deep cleaning' }));

  expect(await screen.findByRole('alert')).toHaveTextContent(
    '1 active add-on is above the current ₱100,000.00 authoring limit',
  );
  expect(screen.getByText('Above current price limit')).toBeInTheDocument();
  expect(screen.getByRole('alert')).toHaveTextContent(/remains visible and bookable.*Historical booking prices do not change/i);

  fireEvent.click(screen.getByRole('button', { name: 'Edit add-on Whole-site supplies' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Description' }), {
    target: { value: 'Reviewed customer-facing scope' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));

  await waitFor(() => expect(apiMocks.put).toHaveBeenCalledWith(
    '/api/v1/catalog/admin/addons/addon-high',
    {
      name: 'Whole-site supplies',
      description: 'Reviewed customer-facing scope',
      displayOrder: 1,
    },
  ));
});
