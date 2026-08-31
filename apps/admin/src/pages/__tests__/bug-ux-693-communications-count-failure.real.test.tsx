import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import api from '@/lib/api';
import CommunicationsPage from '../CommunicationsPage';

it('Bug UX-693 — a failed moderation-count request is shown as unavailable with retry instead of false zero counts', async () => {
  vi.mocked(api.get).mockImplementation(async (url: string) => {
    if (url === '/api/v1/admin/conversations/stats') throw new Error('count service unavailable');
    if (url === '/api/v1/admin/conversations/queue') {
      return { data: { success: true, messages: [], total: 0 } } as never;
    }
    throw new Error(`Unexpected GET ${url}`);
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter><CommunicationsPage /></MemoryRouter>
    </QueryClientProvider>,
  );

  expect(await screen.findByRole('alert')).toHaveTextContent(/counts could not be loaded/i);
  expect(screen.queryByText('Flagged, awaiting review')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Retry counts' }));
  await waitFor(() => expect(vi.mocked(api.get).mock.calls.filter(([url]) => url === '/api/v1/admin/conversations/stats')).toHaveLength(2));
});
