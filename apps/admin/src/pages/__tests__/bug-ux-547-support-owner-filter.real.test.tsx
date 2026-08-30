import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const apiGet = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', () => ({
  default: { get: apiGet, post: vi.fn(), patch: vi.fn() },
  getErrorMessage: (error: Error) => error.message,
}));
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('react-router-dom');
  return {
    ...actual,
    useSearchParams: () => [
      new URLSearchParams('assignedAgentId=22222222-2222-4222-8222-222222222222&active=1&agentName=Ana%20Reyes'),
      vi.fn(),
    ],
  };
});

import SupportTicketsPage from '../SupportTicketsPage';

it('Bug UX-547 — a staff workload link opens a visible active queue filtered to that exact support owner', async () => {
  apiGet.mockImplementation((url: string) => {
    if (url.startsWith('/api/v1/support-tickets?')) return Promise.resolve({ data: { data: [], meta: { total: 0 } } });
    if (url === '/api/v1/support-tickets/summary') return Promise.resolve({ data: { data: { open: 0, escalated: 0, urgent: 0, unassigned: 0 } } });
    if (url === '/api/v1/support-tickets/agents') return Promise.resolve({ data: { data: [] } });
    return Promise.resolve({ data: { data: [] } });
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/support-tickets?assignedAgentId=22222222-2222-4222-8222-222222222222&active=1&agentName=Ana%20Reyes']}>
        <SupportTicketsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );

  expect(await screen.findByText('Staff ownership view')).toBeInTheDocument();
  expect(screen.getByText('Assigned to Ana Reyes · active cases only')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Clear staff owner' })).toBeInTheDocument();
  await waitFor(() => expect(apiGet).toHaveBeenCalledWith(expect.stringContaining(
    'assignedAgentId=22222222-2222-4222-8222-222222222222',
  )));
});
