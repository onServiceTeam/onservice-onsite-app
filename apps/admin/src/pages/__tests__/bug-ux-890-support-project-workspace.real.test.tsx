import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn() }));
const routerMocks = vi.hoisted(() => ({
  params: new URLSearchParams(),
  setSearchParams: vi.fn(),
}));
vi.mock('@/lib/api', () => ({ default: apiMocks, getErrorMessage: () => 'Request failed' }));
vi.mock('react-router-dom', async () => {
  const ReactModule = await import('react');
  const actual = await vi.importActual<Record<string, unknown>>('react-router-dom');
  return {
    ...actual,
    useSearchParams: () => [routerMocks.params, routerMocks.setSearchParams],
    Link: ({ children, ...props }: { children: React.ReactNode }) =>
      ReactModule.createElement('a', props, children),
  };
});

import SupportTicketsPage from '../SupportTicketsPage';

it('Bug UX-890 — Admin can filter, inspect, and return to the exact planning project attached to a support case', async () => {
  const projectId = '22222222-2222-4222-8222-222222222222';
  const customerId = '11111111-1111-4111-8111-111111111111';
  const ticketId = '33333333-3333-4333-8333-333333333333';
  const ticket = {
    id: ticketId, ticket_number: 'TKT-1890', user_id: customerId, assigned_agent_id: null,
    type: 'general_inquiry', status: 'open', priority: 'medium', subject: 'Kitchen planning help',
    description: 'Please review this planning record.', booking_id: null, project_id: projectId,
    project_title: 'Kitchen renovation plan', resolution_notes: null, resolved_at: null, closed_at: null,
    created_at: '2026-09-01T00:00:00.000Z', updated_at: '2026-09-01T01:00:00.000Z',
    user_role: 'customer', user_first_name: 'Maria', user_last_name: 'S.', messages: [], message_count: 0,
  };
  apiMocks.get.mockImplementation(async (url: string) => {
    if (url === '/api/v1/support-tickets/summary') return { data: { data: { open: 1, escalated: 0, urgent: 0, unassigned: 1 } } };
    if (url === '/api/v1/support-tickets/agents') return { data: { data: [] } };
    if (url === `/api/v1/support-tickets/${ticketId}/history`) return { data: { data: [] } };
    if (url === `/api/v1/support-tickets/${ticketId}`) return { data: { data: ticket } };
    return { data: { data: [ticket], meta: { total: 1 } } };
  });
  routerMocks.params = new URLSearchParams(
    `projectId=${projectId}&userId=${customerId}&userName=Maria%20Santos&userRole=customer`,
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });

  const view = render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <SupportTicketsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );

  expect(await screen.findByText((_, element) => element?.textContent === `Project: ${projectId} (planning context)`)).toBeVisible();
  await waitFor(() => expect(apiMocks.get).toHaveBeenCalledWith(expect.stringContaining(`projectId=${projectId}`)));
  routerMocks.params = new URLSearchParams(`projectId=${projectId}&ticketId=${ticketId}`);
  view.rerender(
    <QueryClientProvider client={client}>
      <MemoryRouter><SupportTicketsPage /></MemoryRouter>
    </QueryClientProvider>,
  );
  const projectLink = await screen.findByText('Kitchen renovation plan');
  expect(projectLink).toHaveAttribute('to', `/projects?projectId=${projectId}&source=support&ticketId=${ticketId}`);
  expect(screen.getByText('Planning context only')).toBeVisible();
});
