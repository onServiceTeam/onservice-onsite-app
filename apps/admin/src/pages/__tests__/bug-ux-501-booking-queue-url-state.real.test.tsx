import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({ get: vi.fn() }));
const routerMocks = vi.hoisted(() => ({
  params: new URLSearchParams('view=support&sort=scheduled&page=2'),
  setSearchParams: vi.fn(),
}));
vi.mock('@/lib/api', () => ({ default: apiMocks }));
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('react-router-dom');
  return { ...actual, useSearchParams: () => [routerMocks.params, routerMocks.setSearchParams] };
});

import BookingsPage from '../BookingsPage';

it('Bug UX-501 — booking queue restores URL-bound page/view/sort state and writes a shareable quick-view selection', async () => {
  apiMocks.get.mockResolvedValue({ data: {
    success: true,
    summary: { totalBookings: 0, activeBookings: 0, unassignedActive: 0, openSupportBookings: 0, disputedBookings: 0, pastScheduledBookings: 0 },
    data: [], pagination: { page: 2, pageSize: 20, total: 0, totalPages: 0 },
  } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter([{ path: '/', element: <QueryClientProvider client={client}><BookingsPage /></QueryClientProvider> }]);

  render(<RouterProvider router={router} />);

  await waitFor(() => expect(apiMocks.get).toHaveBeenCalledWith('/api/v1/admin/bookings', {
    params: expect.objectContaining({ page: 2, view: 'support', sort: 'scheduled' }),
  }));
  expect(await screen.findByRole('button', { name: /Open support/ })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('combobox', { name: 'Sort booking queue' })).toHaveValue('scheduled');

  fireEvent.click(screen.getByRole('button', { name: /Paid needs assignment/ }));
  expect(routerMocks.setSearchParams).toHaveBeenCalledWith('view=unassigned&sort=scheduled', { replace: true });
  await waitFor(() => expect(apiMocks.get).toHaveBeenCalledWith('/api/v1/admin/bookings', {
    params: expect.objectContaining({ view: 'unassigned', sort: 'scheduled' }),
  }));
});
