import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';

const apiGet = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', () => ({ default: { get: apiGet } }));

import BusinessAccountsPage from '../BusinessAccountsPage';

beforeEach(() => {
  apiGet.mockReset();
  apiGet
    .mockRejectedValueOnce(new Error('business-account source offline'))
    .mockResolvedValue({
      data: {
        success: true,
        data: [],
        pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
      },
    });
});

it('Bug UX-1262 - a failed business-account directory read offers an in-place retry and recovers to the empty state', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter><BusinessAccountsPage /></MemoryRouter>
    </QueryClientProvider>,
  );

  expect(await screen.findByRole('heading', { name: 'Business accounts unavailable' })).toBeInTheDocument();
  expect(screen.getByText(/Do not treat it as empty before making an account or credit decision/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Retry business accounts' }));

  await waitFor(() => expect(apiGet).toHaveBeenCalledTimes(2));
  expect(await screen.findByText('No business accounts found.')).toBeInTheDocument();
});
