import { beforeEach, expect, it, vi } from 'vitest';
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import api from '@/lib/api';
import CatalogPage from '../CatalogPage';

const missingService = {
  id: 'service-missing', categoryId: 'category-1', name: 'Aircon cleaning', slug: 'aircon-cleaning',
  description: '', pricingType: 'fixed', basePrice: 95000, minPrice: null, maxPrice: null,
  estimatedDurationMinutes: 90, unitLabel: null, unitPrice: null, hourlyRate: null, displayOrder: 1,
};

beforeEach(() => {
  vi.mocked(api.get).mockReset().mockResolvedValue({
    data: {
      success: true,
      data: [{
        id: 'category-1', name: 'Aircon', slug: 'aircon', description: 'Aircon services',
        iconUrl: null, displayOrder: 1,
        subcategories: [
          missingService,
          { ...missingService, id: 'service-ready', name: 'Aircon inspection', description: 'Includes a visual inspection and written findings before any repair is approved.' },
        ],
      }],
    },
  } as never);
});

it('Bug UX-044 — catalog operators can find missing service scope and preview the exact customer copy before saving', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><CatalogPage /></QueryClientProvider>);

  const needsScope = await screen.findByRole('button', { name: /1 Need customer scope/i });
  fireEvent.click(needsScope);
  expect(screen.getByText('Missing customer scope')).toBeTruthy();
  expect(screen.queryByText('Aircon inspection')).toBeNull();

  fireEvent.click(screen.getByRole('button', { name: 'Edit service Aircon cleaning' }));
  expect(screen.getByRole('textbox', { name: 'Customer service scope' })).toBeRequired();
  expect(screen.getByLabelText('Customer service preview')).toHaveTextContent('Add customer-facing scope before this service can be saved.');
  expect(screen.getByText(/State what is covered, important exclusions or limits/i)).toBeTruthy();
});
