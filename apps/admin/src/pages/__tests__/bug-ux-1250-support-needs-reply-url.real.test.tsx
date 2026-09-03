import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import api from '@/lib/api';

vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));

import SupportTicketsPage from '../SupportTicketsPage';

it('Bug UX-1250 - a saved needs-reply queue URL sends the filter to the API and identifies the active view', async () => {
  vi.mocked(api.get).mockImplementation(async (url: string) => {
    if (url === '/api/v1/support-tickets/summary') {
      return { data: { data: { open: 0, escalated: 0, urgent: 0, unassigned: 0, awaitingReply: 0 } } } as never;
    }
    return { data: { data: [], meta: { total: 0 } } } as never;
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/support-tickets?needsReply=1&active=1']}>
        <SupportTicketsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );

  expect(await screen.findByRole('button', { name: 'Awaiting agent reply only (clear)' })).toBeVisible();
  await waitFor(() => expect(vi.mocked(api.get).mock.calls.some(([url]) => {
    const requestUrl = String(url);
    return requestUrl.startsWith('/api/v1/support-tickets?')
      && requestUrl.includes('needsReply=1')
      && requestUrl.includes('active=1');
  })).toBe(true));
});
