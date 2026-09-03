import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import api from '@/lib/api';

import SupportTicketsPage from '../SupportTicketsPage';

it('Bug OPS-304 — the support queue shows the latest case activity instead of its original creation time', async () => {
  const createdAt = '2026-08-01T06:30:00.000Z';
  const updatedAt = '2026-09-01T06:30:00.000Z';
  vi.mocked(api.get).mockImplementation(async (url: string) => {
    if (url === '/api/v1/support-tickets/summary') {
      return { data: { data: { open: 1, escalated: 0, urgent: 0, unassigned: 1 } } } as never;
    }
    if (url === '/api/v1/support-tickets/agents') return { data: { data: [] } } as never;
    return {
      data: {
        data: [{
          id: 'ticket-304', ticket_number: 'TKT-304', user_id: 'customer-304', assigned_agent_id: null,
          type: 'booking_issue', status: 'open', priority: 'medium', subject: 'Customer replied',
          description: 'The customer added new evidence.', booking_id: null, resolution_notes: null,
          resolved_at: null, closed_at: null, created_at: createdAt, updated_at: updatedAt,
          user_first_name: 'Ana', user_last_name: 'Reyes', user_role: 'customer', message_count: 2,
        }],
        meta: { total: 1 },
      },
    } as never;
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(<QueryClientProvider client={client}><SupportTicketsPage /></QueryClientProvider>);

  expect(await screen.findByRole('columnheader', { name: 'Last activity' })).toBeTruthy();
  const expectedActivity = new Date(updatedAt).toLocaleString('en-PH', {
    timeZone: 'Asia/Manila', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
  expect(await screen.findByText(expectedActivity)).toBeTruthy();
});
