import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import api from '@/lib/api';

/**
 * D38 (2026-10-13): the min/max bounds on a service are shown to customers on
 * the "Book a service" request form as an onService price guide, for every
 * pricing type. Admin must therefore label them honestly and save them for a
 * quote service too (before, saving a quote service sent null and wiped them).
 */

vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { role: 'super_admin' } }),
}));

import CatalogPage from '../CatalogPage';

beforeEach(() => {
  vi.mocked(api.get).mockReset().mockResolvedValue({
    data: {
      success: true,
      data: [{
        id: '22222222-2222-2222-2222-222222222222',
        name: 'Aircon',
        slug: 'aircon',
        description: 'Aircon services',
        iconUrl: null,
        displayOrder: 1,
        subcategories: [],
      }],
    },
  } as never);
  vi.mocked(api.post).mockReset().mockResolvedValue({ data: { success: true, data: {} } } as never);
});

it('HA-ADM-01: a quote service saves its customer price guide instead of wiping it', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><CatalogPage /></QueryClientProvider>);

  fireEvent.click(await screen.findByRole('button', { name: 'Add service to Aircon' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: 'Aircon repair' } });
  fireEvent.change(screen.getByRole('textbox', { name: 'Customer service scope' }), {
    target: { value: 'Diagnosis and repair of a split or window aircon unit that is not cooling properly.' },
  });
  fireEvent.change(screen.getByRole('combobox', { name: 'Pricing type' }), { target: { value: 'quote' } });

  // The guide is offered for quote services and says customers see it.
  expect(screen.getByLabelText('Customer price guide')).toBeTruthy();
  expect(screen.getByText(/Customers see this on the request form/)).toBeTruthy();

  fireEvent.change(screen.getByRole('spinbutton', { name: 'Guide minimum (₱)' }), { target: { value: '800' } });
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Guide maximum (₱)' }), { target: { value: '5000' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));

  await waitFor(() => expect(api.post).toHaveBeenCalledWith(
    '/api/v1/catalog/admin/subcategories',
    expect.objectContaining({ pricingType: 'quote', basePrice: null, minPrice: 80000, maxPrice: 500000 }),
  ));
});
