import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/lib/api', () => ({ default: apiMocks }));

import CustomersPage from '../CustomersPage';

it('Bug UX-494 — customer queue remains usable when an older response has customer rows and pagination but no additive fields', async () => {
  apiMocks.get.mockResolvedValueOnce({ data: {
    success: true,
    data: [{
      id: 'legacy-customer', phone: '+63 9XX XXX 1111', email: null,
      firstName: 'Legacy', lastName: 'Customer', status: 'active',
      totalBookings: 1, totalSpent: 25000, totalDisputes: 0,
      createdAt: '2026-08-01T00:00:00.000Z',
    }],
    pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1 },
  } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(<QueryClientProvider client={client}><MemoryRouter><CustomersPage /></MemoryRouter></QueryClientProvider>);

  expect(await screen.findByText('Legacy Customer')).toBeVisible();
  expect(screen.getByText('0 active')).toBeVisible();
  expect(screen.getByText('0 support cases')).toBeVisible();
  expect(screen.getByRole('button', { name: /All customers/ })).toHaveTextContent('0');
  expect(screen.getByRole('button', { name: /Fraud review/ })).toHaveTextContent('0');
});
