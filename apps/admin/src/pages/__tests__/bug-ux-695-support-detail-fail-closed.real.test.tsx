import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, it, vi } from 'vitest';
import api from '@/lib/api';
import SupportTicketsPage from '../SupportTicketsPage';

it('Bug UX-695 — a failed case-detail request blocks stale status, ownership, priority, and reply controls', async () => {
  const ticket = {
    id: 'ticket-1', ticket_number: 'TKT-4001', user_id: 'customer-1', assigned_agent_id: null,
    type: 'booking_issue', status: 'open', priority: 'high', subject: 'Provider did not arrive',
    description: 'Customer needs help.', booking_id: null, resolution_notes: null, resolved_at: null,
    closed_at: null, created_at: '2026-08-31T01:00:00.000Z', updated_at: '2026-08-31T01:00:00.000Z',
    user_role: 'customer', user_first_name: 'Maria', user_last_name: 'S.', messages: [],
  };
  vi.mocked(api.get).mockImplementation(async (url: string) => {
    if (url === '/api/v1/support-tickets/summary') return { data: { data: { open: 1, escalated: 0, urgent: 0, unassigned: 1 } } } as never;
    if (url === '/api/v1/support-tickets/agents') return { data: { data: [] } } as never;
    if (url === '/api/v1/support-tickets/ticket-1/history') return { data: { data: [] } } as never;
    if (url === '/api/v1/support-tickets/ticket-1') throw new Error('Case detail unavailable');
    return { data: { data: [ticket], meta: { total: 1 } } } as never;
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><SupportTicketsPage /></QueryClientProvider>);

  fireEvent.click(await screen.findByRole('button', { name: 'View' }));

  expect(await screen.findByText('The complete support case could not be loaded.')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Retry case details' })).toBeTruthy();
  expect(screen.queryByRole('combobox', { name: 'Change support ticket status' })).toBeNull();
  expect(screen.queryByLabelText('Reply message')).toBeNull();
});
