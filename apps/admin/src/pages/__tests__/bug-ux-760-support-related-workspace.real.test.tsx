import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn() }));
vi.mock('@/lib/api', () => ({ default: apiMocks, getErrorMessage: () => 'Request failed' }));
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('react-router-dom');
  return {
    ...actual,
    useSearchParams: () => [
      new URLSearchParams('relatedProviderId=0198f711-c7c8-7a42-8c86-43f49d91f2d1&userName=Cebu%20Cleaners&userRole=provider'),
      vi.fn(),
    ],
  };
});

import SupportTicketsPage from '../SupportTicketsPage';

it('Bug UX-760 — the support queue preserves a Provider 360 related-account filter through its rendered API request and context banner', async () => {
  apiMocks.get.mockImplementation(async (url: string) => {
    if (url.endsWith('/summary')) return { data: { data: { open: 0, escalated: 0, urgent: 0, unassigned: 0 } } };
    if (url.endsWith('/agents')) return { data: { data: [] } };
    return { data: { data: [], meta: { total: 0 } } };
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={client}>
      <MemoryRouter><SupportTicketsPage /></MemoryRouter>
    </QueryClientProvider>,
  );

  expect(await screen.findByText('Related account: Cebu Cleaners')).toBeVisible();
  await waitFor(() => expect(apiMocks.get).toHaveBeenCalledWith(expect.stringContaining(
    'relatedProviderId=0198f711-c7c8-7a42-8c86-43f49d91f2d1',
  )));
  expect(screen.getByRole('button', { name: 'Clear linked view' })).toBeVisible();
});
