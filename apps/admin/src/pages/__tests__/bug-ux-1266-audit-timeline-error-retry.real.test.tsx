import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';

const apiGet = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', () => ({
  default: { get: apiGet },
  getErrorMessage: (error: Error) => error.message,
}));

import AuditLogPage from '../AuditLogPage';

beforeEach(() => {
  apiGet.mockReset();
  apiGet
    .mockRejectedValueOnce(new Error('audit source offline'))
    .mockResolvedValue({
      data: {
        data: [],
        pagination: { page: 1, pageSize: 50, total: 0, totalPages: 0 },
      },
    });
});

it('Bug UX-1266 - a failed audit timeline read warns against false absence and recovers through retry', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter><AuditLogPage /></MemoryRouter>
    </QueryClientProvider>,
  );

  expect(await screen.findByRole('heading', { name: 'Audit timeline unavailable' })).toBeInTheDocument();
  expect(screen.getByText(/Do not treat an unavailable timeline as proof that no action was recorded/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Retry audit timeline' }));

  await waitFor(() => expect(apiGet).toHaveBeenCalledTimes(2));
  expect(await screen.findByText('No matching recorded events')).toBeInTheDocument();
});
