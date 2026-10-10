import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const apiGet = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', () => ({
  default: { get: apiGet, post: vi.fn(), patch: vi.fn() },
  getErrorMessage: (error: Error) => error.message,
}));
vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));

import SupportTicketsPage from '../SupportTicketsPage';

it('Bug UX-1218 - uppercase support queue identifiers are sent as canonical filters', async () => {
  const bookingId = '12180000-abcd-4abc-8def-000000001218';
  const userId = '12180000-abcd-4abc-8def-000000001219';
  const providerId = '12180000-abcd-4abc-8def-000000001220';
  const agentId = '12180000-abcd-4abc-8def-000000001221';
  apiGet.mockImplementation((url: string) => {
    if (url === '/api/v1/support-tickets/summary') return Promise.resolve({ data: { data: { open: 0, escalated: 0, urgent: 0, unassigned: 0 } } });
    if (url === '/api/v1/support-tickets/agents') return Promise.resolve({ data: { data: [] } });
    if (url.startsWith('/api/v1/support-tickets?')) return Promise.resolve({ data: { data: [], meta: { total: 0 } } });
    return Promise.reject(new Error(`Unexpected request: ${url}`));
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });

  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/support-tickets?bookingId=${bookingId.toUpperCase()}&userId=${userId.toUpperCase()}&relatedProviderId=${providerId.toUpperCase()}&assignedAgentId=${agentId.toUpperCase()}`]}>
        <SupportTicketsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );

  await waitFor(() => expect(apiGet.mock.calls.some(([url]) => {
    const value = String(url);
    return value.startsWith('/api/v1/support-tickets?')
      && value.includes(`bookingId=${bookingId}`)
      && value.includes(`userId=${userId}`)
      && value.includes(`relatedProviderId=${providerId}`)
      && value.includes(`assignedAgentId=${agentId}`);
  })).toBe(true));
  expect(apiGet.mock.calls.some(([url]) => String(url).includes('ABCD'))).toBe(false);
});
