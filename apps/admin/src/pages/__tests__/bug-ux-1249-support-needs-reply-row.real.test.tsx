import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import api from '@/lib/api';

import SupportTicketsPage from '../SupportTicketsPage';

it('Bug UX-1249 - an active case with no public agent response is visibly marked as needing a reply', async () => {
  vi.mocked(api.get).mockImplementation(async (url: string) => {
    if (url === '/api/v1/support-tickets/summary') {
      return { data: { data: { open: 1, escalated: 0, urgent: 0, unassigned: 1, awaitingReply: 1 } } } as never;
    }
    if (url.startsWith('/api/v1/support-tickets?')) {
      return { data: { data: [{
        id: '12490000-abcd-4abc-8def-000000001249',
        ticket_number: 'TKT-1249',
        user_id: '12490000-abcd-4abc-8def-000000001250',
        assigned_agent_id: null,
        type: 'booking_issue',
        status: 'open',
        priority: 'high',
        subject: 'Provider did not arrive',
        description: 'The customer is waiting for help.',
        booking_id: null,
        project_id: null,
        business_account_id: null,
        resolution_notes: null,
        resolved_at: null,
        closed_at: null,
        created_at: '2026-09-03T08:00:00.000Z',
        updated_at: '2026-09-03T08:05:00.000Z',
        user_first_name: 'Maria',
        user_last_name: 'S.',
        user_role: 'customer',
        message_count: 1,
        first_agent_reply_at: null,
        needs_agent_reply: true,
      }], meta: { total: 1 } } } as never;
    }
    throw new Error(`Unexpected request: ${url}`);
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter><SupportTicketsPage /></MemoryRouter>
    </QueryClientProvider>,
  );

  const subject = await screen.findByText('Provider did not arrive');
  const row = subject.closest('tr');
  expect(row).not.toBeNull();
  expect(within(row!).getByText('Needs reply')).toBeVisible();
  expect(within(row!).getByText('Unassigned')).toBeVisible();
});
