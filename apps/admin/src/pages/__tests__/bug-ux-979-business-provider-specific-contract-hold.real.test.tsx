import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const get = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', () => ({ default: { get }, getErrorMessage: (error: unknown) => String(error) }));
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { role: 'super_admin' } }),
}));

import { ContractsTab } from '../BusinessAccountDetailPage';

it('Bug UX-979 — Business 360 labels and disables provider-specific publication while E56 is open', async () => {
  get.mockResolvedValue({ data: {
    success: true,
    data: [{
      id: 'contract-979', categoryId: 'category-1', categoryName: 'Cleaning',
      subcategoryId: null, subcategoryName: null,
      providerId: 'provider-979', providerName: 'Provider 979',
      contractType: 'on_demand', frequency: null, agreedRate: 100_000,
      discountPercentage: 0, estimatedMonthlyValue: 400_000,
      startDate: '2026-09-01', endDate: null, autoRenew: false,
      status: 'draft', recordVersion: 1, publishedAt: null, createdAt: '2026-09-01',
    }],
    pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
  } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><MemoryRouter><ContractsTab accountId="business-979" /></MemoryRouter></QueryClientProvider>);

  expect(await screen.findByText('Publication held')).toBeInTheDocument();
  expect(screen.getByText(/provider-specific assignment\/funding remains held under E56/i)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Review publish' })).toBeDisabled();
});
