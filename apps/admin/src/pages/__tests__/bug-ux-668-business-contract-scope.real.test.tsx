import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const apiGet = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', () => ({ default: { get: apiGet }, getErrorMessage: (error: unknown) => String(error) }));
vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));

import { ContractsTab } from '../BusinessAccountDetailPage';

it('Bug UX-668 — Business 360 names a contract service scope and links its provider instead of showing detached identifiers', async () => {
  apiGet.mockResolvedValue({ data: {
    success: true,
    data: [{
      id: 'contract-1', categoryId: 'category-1', categoryName: 'Cleaning', subcategoryId: 'subcategory-1', subcategoryName: 'Post-construction cleanup',
      providerId: 'provider-1', providerName: 'Cebu Clean', contractType: 'recurring', frequency: 'monthly', agreedRate: 100000,
      discountPercentage: 10, estimatedMonthlyValue: 400000, startDate: '2026-08-01', endDate: null, autoRenew: true, status: 'active', createdAt: '2026-08-01',
    }],
    pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
  } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><MemoryRouter><ContractsTab accountId="business-1" /></MemoryRouter></QueryClientProvider>);

  expect(await screen.findByText('Post-construction cleanup')).toBeInTheDocument();
  expect(screen.getByText('Cleaning')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Cebu Clean' })).toHaveAttribute('href', '/providers/provider-1');
});
