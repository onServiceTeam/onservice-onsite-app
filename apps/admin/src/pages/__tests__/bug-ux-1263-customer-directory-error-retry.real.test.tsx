import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';

const apiGet = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', () => ({ default: { get: apiGet } }));

import CustomersPage from '../CustomersPage';

beforeEach(() => {
  apiGet.mockReset();
  apiGet
    .mockRejectedValueOnce(new Error('customer directory offline'))
    .mockResolvedValue({
      data: {
        success: true,
        data: [],
        summary: { totalCustomers: 0, activeAccounts: 0, inactiveAccounts: 0, fraudFlagged: 0 },
        pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
      },
    });
});

it('Bug UX-1263 - a failed customer directory read shows unavailable queue signals and recovers through retry', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter><CustomersPage /></MemoryRouter>
    </QueryClientProvider>,
  );

  expect(await screen.findByRole('heading', { name: 'Customer directory unavailable' })).toBeInTheDocument();
  expect(screen.getAllByText('Unavailable')).toHaveLength(4);
  expect(screen.getByText(/Do not treat the unavailable counts as zero/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Retry customers' }));

  await waitFor(() => expect(apiGet).toHaveBeenCalledTimes(2));
  expect(await screen.findByText('No customers match this view.')).toBeInTheDocument();
  expect(screen.getAllByText('0')).toHaveLength(4);
});
