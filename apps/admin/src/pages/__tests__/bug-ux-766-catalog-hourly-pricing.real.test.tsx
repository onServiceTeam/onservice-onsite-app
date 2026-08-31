import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import api from '@/lib/api';
import CatalogPage from '../CatalogPage';

beforeEach(() => {
  vi.mocked(api.get).mockReset().mockResolvedValue({
    data: { success: true, data: [{
      id: 'category-1', name: 'Repairs', slug: 'repairs', description: 'Repair services',
      iconUrl: null, displayOrder: 1, subcategories: [],
    }] },
  } as never);
  vi.mocked(api.post).mockReset().mockResolvedValue({ data: { success: true, data: {} } } as never);
});

it('Bug UX-766 — an hourly catalog service uses its hourly rate without demanding a fixed base price', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><CatalogPage /></QueryClientProvider>);

  fireEvent.click(await screen.findByRole('button', { name: 'Add service to Repairs' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: 'Hourly repairs' } });
  fireEvent.change(screen.getByRole('textbox', { name: 'Customer service scope' }), {
    target: { value: 'Includes repair labor within the authorized time cap and excludes replacement materials.' },
  });
  fireEvent.change(screen.getByLabelText('Pricing type'), { target: { value: 'hourly' } });

  expect(screen.queryByRole('spinbutton', { name: 'Base price (₱)' })).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Hourly rate (₱ / hour)' }), {
    target: { value: '125.50' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));

  await waitFor(() => expect(api.post).toHaveBeenCalledWith(
    '/api/v1/catalog/admin/subcategories',
    expect.objectContaining({ pricingType: 'hourly', basePrice: null, hourlyRate: 12550 }),
  ));
});
