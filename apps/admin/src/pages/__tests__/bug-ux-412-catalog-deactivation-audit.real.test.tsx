import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import api from '@/lib/api';
import CatalogPage from '../CatalogPage';

describe('catalog deactivation', () => {
  beforeEach(() => {
    vi.mocked(api.get).mockReset().mockResolvedValue({
      data: {
        success: true,
        data: [
          {
            id: 'category-1',
            name: 'Cleaning',
            slug: 'cleaning',
            description: 'Cleaning services',
            iconUrl: null,
            displayOrder: 1,
            subcategories: [
              {
                id: 'service-1',
                categoryId: 'category-1',
                name: 'Deep cleaning',
                slug: 'deep-cleaning',
                description: 'A detailed customer-facing scope that explains what the service includes.',
                pricingType: 'fixed',
                basePrice: 150000,
                minPrice: null,
                maxPrice: null,
                estimatedDurationMinutes: 180,
                unitLabel: null,
                unitPrice: null,
                hourlyRate: null,
                displayOrder: 1,
              },
            ],
          },
        ],
      },
    } as never);
    vi.mocked(api.delete).mockReset().mockResolvedValue({ data: { success: true } } as never);
  });

  it('Bug UX-412 — service deactivation requires an audit reason and states customer-booking impact', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <CatalogPage />
      </QueryClientProvider>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Expand Cleaning services' }));
    fireEvent.click(screen.getByRole('button', { name: 'Deactivate service Deep cleaning' }));
    expect(screen.getByText(/stop appearing in customer booking/i)).toBeTruthy();
    expect(api.delete).not.toHaveBeenCalled();

    fireEvent.change(screen.getByRole('textbox', { name: 'Deactivation reason' }), {
      target: { value: 'Service scope is temporarily unavailable.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Deactivate service' }));

    await waitFor(() => {
      expect(api.delete).toHaveBeenCalledWith(
        '/api/v1/catalog/admin/subcategories/service-1',
        { body: { reason: 'Service scope is temporarily unavailable.' } },
      );
    });
  });
});
