import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({ get: vi.fn() }));
const routerMocks = vi.hoisted(() => ({
  params: new URLSearchParams(),
  setSearchParams: vi.fn(),
}));
vi.mock('@/lib/api', () => ({ default: apiMocks }));
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('react-router-dom');
  return { ...actual, useSearchParams: () => [routerMocks.params, routerMocks.setSearchParams] };
});

import CustomersPage from '../CustomersPage';

const emptyResult = {
  success: true,
  summary: { totalCustomers: 0, activeAccounts: 0, inactiveAccounts: 0, fraudFlagged: 0 },
  data: [],
  pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
};

it('Bug UX-492 — changing customer queue sort requests the selected server order instead of showing stale cached rows', async () => {
  apiMocks.get.mockResolvedValue({ data: emptyResult });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter([{
    path: '/',
    element: <QueryClientProvider client={client}><CustomersPage /></QueryClientProvider>,
  }]);

  render(<RouterProvider router={router} />);

  await waitFor(() => expect(apiMocks.get).toHaveBeenCalledWith(
    '/api/v1/admin/customers',
    expect.objectContaining({ params: expect.objectContaining({ sort: 'attention' }) }),
  ));
  expect(await screen.findByText('No customers match this view.')).toBeVisible();

  const sortSelect = screen.getByRole('combobox', { name: 'Sort customer queue' });
  fireEvent.change(sortSelect, {
    target: { value: 'active_work' },
  });
  expect(routerMocks.setSearchParams).toHaveBeenCalledWith('sort=active_work', { replace: true });

  await waitFor(() => expect(apiMocks.get).toHaveBeenCalledWith(
    '/api/v1/admin/customers',
    expect.objectContaining({ params: expect.objectContaining({ sort: 'active_work' }) }),
  ));
  await waitFor(() => expect(screen.getByRole('combobox', { name: 'Sort customer queue' })).toHaveValue('active_work'));
});
