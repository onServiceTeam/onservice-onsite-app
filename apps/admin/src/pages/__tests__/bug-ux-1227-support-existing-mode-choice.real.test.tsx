import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
}));
vi.mock('@/lib/api', () => ({
  default: apiMocks,
  getErrorMessage: (error: Error) => error.message,
}));
vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));

import SupportTicketsPage from '../SupportTicketsPage';

it('Bug UX-1227 - contradictory create and detail links load no support data until existing-case mode is chosen', async () => {
  const userId = '12270000-abcd-4abc-8def-000000001227';
  const ticketId = '12270000-abcd-4abc-8def-000000001228';
  const ticket = {
    id: ticketId,
    ticket_number: 'TKT-1227',
    user_id: userId,
    assigned_agent_id: null,
    type: 'payment_issue',
    status: 'open',
    priority: 'high',
    subject: 'Existing payment case',
    description: 'A previously reported payment issue.',
    booking_id: null,
    project_id: null,
    business_account_id: null,
    resolution_notes: null,
    resolved_at: null,
    closed_at: null,
    created_at: '2026-09-04T01:00:00.000Z',
    updated_at: '2026-09-04T01:00:00.000Z',
    user_role: 'customer',
    user_first_name: 'Maria',
    user_last_name: 'Santos',
    message_count: 0,
    messages: [],
  };
  apiMocks.get.mockImplementation((url: string) => {
    if (url === `/api/v1/support-tickets/${ticketId}`) {
      return Promise.resolve({ data: { data: ticket } });
    }
    if (url === `/api/v1/support-tickets/${ticketId}/history`) {
      return Promise.resolve({ data: { data: [] } });
    }
    if (url === '/api/v1/support-tickets/agents') {
      return Promise.resolve({ data: { data: [] } });
    }
    return Promise.reject(new Error(`Unexpected request: ${url}`));
  });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  });

  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/support-tickets?new=1&userId=${userId}&ticketId=${ticketId}`]}>
        <SupportTicketsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );

  expect(await screen.findByText('Choose one support workspace mode')).toBeVisible();
  expect(apiMocks.get).not.toHaveBeenCalled();
  expect(screen.queryByLabelText('New support case subject')).toBeNull();

  fireEvent.click(screen.getByRole('button', { name: 'Open existing case' }));

  expect(await screen.findByRole('heading', { name: 'TKT-1227: Existing payment case' })).toBeVisible();
  await waitFor(() => {
    expect(apiMocks.get).toHaveBeenCalledWith(`/api/v1/support-tickets/${ticketId}`);
    expect(apiMocks.get).toHaveBeenCalledWith(`/api/v1/support-tickets/${ticketId}/history`);
  });
  const requestedUrls = apiMocks.get.mock.calls.map(([url]) => String(url));
  expect(requestedUrls).not.toContain(`/api/v1/support-tickets/account-context/${userId}`);
  expect(requestedUrls.some((url) => url.startsWith('/api/v1/support-tickets?'))).toBe(false);
});
