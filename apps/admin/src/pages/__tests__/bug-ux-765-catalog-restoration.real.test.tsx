import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import api from '@/lib/api';
import CatalogPage from '../CatalogPage';

const catalogFixture = [{
  id: 'category-1',
  name: 'Cleaning',
  slug: 'cleaning',
  description: 'Cleaning services',
  iconUrl: null,
  displayOrder: 1,
  subcategories: [{
    id: 'active-service', categoryId: 'category-1', name: 'Active cleaning', slug: 'active-cleaning',
    description: 'Includes the active cleaning scope and the customer-facing service limits.',
    pricingType: 'fixed', basePrice: 100000, minPrice: null, maxPrice: null,
    estimatedDurationMinutes: 120, unitLabel: null, unitPrice: null, hourlyRate: null,
    displayOrder: 1, isActive: true,
  }, {
    id: 'inactive-service', categoryId: 'category-1', name: 'Paused cleaning', slug: 'paused-cleaning',
    description: 'Includes the paused cleaning scope and the customer-facing service limits.',
    pricingType: 'fixed', basePrice: 120000, minPrice: null, maxPrice: null,
    estimatedDurationMinutes: 150, unitLabel: null, unitPrice: null, hourlyRate: null,
    displayOrder: 2, isActive: false,
  }],
}];

beforeEach(() => {
  vi.mocked(api.get).mockReset().mockResolvedValue({ data: { success: true, data: catalogFixture } } as never);
  vi.mocked(api.post).mockReset().mockResolvedValue({ data: { success: true, data: {} } } as never);
});

it('Bug UX-765 — operators can filter to an inactive service and restore it with an audit reason', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><CatalogPage /></QueryClientProvider>);

  fireEvent.click(await screen.findByRole('button', { name: /1 inactive services/i }));
  expect(screen.queryByText('Active cleaning')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Restore service Paused cleaning' }));
  expect(screen.getByText(/return to customer discovery and new booking/i)).toBeInTheDocument();

  fireEvent.change(screen.getByRole('textbox', { name: 'Restoration reason' }), {
    target: { value: 'Scope and pricing were reviewed and approved.' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Restore service' }));

  await waitFor(() => expect(api.post).toHaveBeenCalledWith(
    '/api/v1/catalog/admin/subcategories/inactive-service/reactivate',
    { reason: 'Scope and pricing were reviewed and approved.' },
  ));
});
