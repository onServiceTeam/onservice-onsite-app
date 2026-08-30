import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';

const apiGet = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', () => ({
  default: { get: apiGet },
  getErrorMessage: (error: unknown) => error instanceof Error ? error.message : 'Request failed',
}));

import FinancialsPage from '../FinancialsPage';

beforeEach(() => {
  apiGet.mockReset();
  apiGet.mockRejectedValue(new Error('Financial source offline'));
});

it('Bug UX-575 — a failed financial overview source does not present missing money figures as real zero values', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/financials']}>
        <FinancialsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );

  expect(await screen.findByText('Financial overview unavailable')).toBeInTheDocument();
  expect(screen.getByText(/Do not treat missing figures as zero/)).toBeInTheDocument();
  expect(screen.queryByText('₱0.00')).not.toBeInTheDocument();
  expect(screen.queryByText('GMV')).not.toBeInTheDocument();
});
