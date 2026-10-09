import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';

const apiGet = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', () => ({
  default: { get: apiGet, put: vi.fn() },
  getErrorMessage: (error: Error) => error.message,
}));

import ProvidersPage from '../ProvidersPage';

beforeEach(() => {
  apiGet.mockReset();
  apiGet
    .mockRejectedValueOnce(new Error('provider directory offline'))
    .mockResolvedValue({
      data: {
        success: true,
        data: [],
        pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0 },
      },
    });
});

it('Bug UX-1265 - a failed provider directory read blocks operational decisions and recovers through retry', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter><ProvidersPage /></MemoryRouter>
    </QueryClientProvider>,
  );

  expect(await screen.findByRole('heading', { name: 'Provider directory unavailable' })).toBeInTheDocument();
  expect(screen.getByText(/Do not make approval, suspension, or tier decisions/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Retry providers' }));

  await waitFor(() => expect(apiGet).toHaveBeenCalledTimes(2));
  expect(await screen.findByText('No providers found.')).toBeInTheDocument();
});
