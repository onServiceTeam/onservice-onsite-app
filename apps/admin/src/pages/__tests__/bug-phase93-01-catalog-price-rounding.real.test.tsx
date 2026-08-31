import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import api from '@/lib/api';

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
        name: 'Cleaning',
        slug: 'cleaning',
        description: 'Cleaning services',
        iconUrl: null,
        displayOrder: 1,
        subcategories: [],
      }],
    },
  } as never);
  vi.mocked(api.post).mockReset().mockResolvedValue({ data: { success: true, data: {} } } as never);
});

it('BUG-PHASE93-01 — a decimal catalog price is submitted as whole centavos', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><CatalogPage /></QueryClientProvider>);

  fireEvent.click(await screen.findByRole('button', { name: 'Add service to Cleaning' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: 'Deep cleaning' } });
  fireEvent.change(screen.getByRole('textbox', { name: 'Customer service scope' }), {
    target: { value: 'Includes the agreed deep-cleaning tasks and all important customer-facing limits.' },
  });
  fireEvent.change(screen.getByRole('spinbutton', { name: 'Base price (₱)' }), { target: { value: '500.55' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));

  await waitFor(() => expect(api.post).toHaveBeenCalledWith(
    '/api/v1/catalog/admin/subcategories',
    expect.objectContaining({ basePrice: 50055 }),
  ));
});
