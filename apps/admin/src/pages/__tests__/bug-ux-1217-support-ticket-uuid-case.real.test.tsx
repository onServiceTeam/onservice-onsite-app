import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
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

it('Bug UX-1217 - an uppercase support-case link loads canonical detail and history', async () => {
  const ticketId = '12170000-abcd-4abc-8def-000000001217';
  const ticket = {
    id: ticketId,
    ticket_number: 'TKT-1217',
    user_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    assigned_agent_id: null,
    type: 'account_issue',
    status: 'open',
    priority: 'medium',
    subject: 'Canonical support handoff',
    description: 'Review the linked account issue.',
    booking_id: null,
    project_id: null,
    business_account_id: null,
    resolution_notes: null,
    resolved_at: null,
    closed_at: null,
    created_at: '2026-09-03T00:00:00.000Z',
    updated_at: '2026-09-03T01:00:00.000Z',
    user_role: 'customer',
    user_first_name: 'Maria',
    user_last_name: 'S.',
    messages: [],
  };
  apiGet.mockImplementation((url: string) => {
    if (url === '/api/v1/support-tickets/summary') return Promise.resolve({ data: { data: { open: 1, escalated: 0, urgent: 0, unassigned: 1 } } });
    if (url === '/api/v1/support-tickets/agents') return Promise.resolve({ data: { data: [] } });
    if (url === `/api/v1/support-tickets/${ticketId}/history`) return Promise.resolve({ data: { data: [] } });
    if (url === `/api/v1/support-tickets/${ticketId}`) return Promise.resolve({ data: { data: ticket } });
    if (url.startsWith('/api/v1/support-tickets?')) return Promise.resolve({ data: { data: [], meta: { total: 0 } } });
    return Promise.reject(new Error(`Unexpected request: ${url}`));
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });

  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/support-tickets?ticketId=${ticketId.toUpperCase()}`]}>
        <SupportTicketsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );

  expect(await screen.findByText('TKT-1217: Canonical support handoff')).toBeVisible();
  expect(apiGet).toHaveBeenCalledWith(`/api/v1/support-tickets/${ticketId}`);
  expect(apiGet).toHaveBeenCalledWith(`/api/v1/support-tickets/${ticketId}/history`);
  expect(apiGet.mock.calls.some(([url]) => String(url).includes(ticketId.toUpperCase()))).toBe(false);
});
