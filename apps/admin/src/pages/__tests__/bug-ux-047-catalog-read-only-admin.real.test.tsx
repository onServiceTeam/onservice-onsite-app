import { beforeEach, expect, it, vi } from 'vitest';
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import api from '@/lib/api';

vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { role: 'admin' } }),
}));

import CatalogPage from '../CatalogPage';

beforeEach(() => {
  vi.mocked(api.get).mockReset().mockResolvedValue({
    data: {
      success: true,
      data: [{
        id: 'category-1', name: 'Cleaning', slug: 'cleaning', description: 'Cleaning services',
        iconUrl: null, displayOrder: 1,
        subcategories: [{
          id: 'service-1', categoryId: 'category-1', name: 'Deep cleaning', slug: 'deep-cleaning',
          description: 'Includes agreed deep-cleaning tasks and documents important limits before booking.',
          pricingType: 'fixed', basePrice: 150000, minPrice: null, maxPrice: null,
          estimatedDurationMinutes: 180, unitLabel: null, unitPrice: null, hourlyRate: null, displayOrder: 1,
        }],
      }],
    },
  } as never);
});

it('Bug UX-047 — ordinary admins can inspect catalog evidence without seeing controls the API will reject', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><CatalogPage /></QueryClientProvider>);

  expect(await screen.findByText(/read-only catalog access/i)).toBeTruthy();
  expect(screen.queryByRole('button', { name: /Add Category/i })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Edit category Cleaning' })).toBeNull();

  fireEvent.click(screen.getByRole('button', { name: 'Expand Cleaning services' }));
  expect(screen.getByRole('button', { name: 'Show add-ons for Deep cleaning' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Show intake fields for Deep cleaning' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Edit service Deep cleaning' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Remove service Deep cleaning' })).toBeNull();
});
