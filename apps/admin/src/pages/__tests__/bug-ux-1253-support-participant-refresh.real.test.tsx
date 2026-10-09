import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import api from '@/lib/api';
import SupportTicketsPage from '../SupportTicketsPage';

afterEach(() => vi.useRealTimers());

it('Bug UX-1253 - the active Admin Support queue refreshes participant changes without a manual reload', async () => {
  vi.useFakeTimers();
  let listRead = 0;
  vi.mocked(api.get).mockImplementation(async (url: string) => {
    if (url === '/api/v1/support-tickets/summary') {
      return { data: { data: { open: 1, escalated: 0, urgent: 0, unassigned: 1, awaitingReply: 1 } } } as never;
    }
    if (url.startsWith('/api/v1/support-tickets?')) {
      listRead += 1;
      return { data: { data: [{
        id: '12530000-abcd-4abc-8def-000000001253',
        ticket_number: 'TKT-1253',
        user_id: '12530000-abcd-4abc-8def-000000001254',
        assigned_agent_id: null,
        type: 'general_inquiry',
        status: 'open',
        priority: 'medium',
        subject: listRead === 1 ? 'Waiting for participant' : 'Participant replied just now',
        description: 'Please review this request.',
        booking_id: null,
        project_id: null,
        business_account_id: null,
        resolution_notes: null,
        resolved_at: null,
        closed_at: null,
        created_at: '2026-09-04T01:00:00.000Z',
        updated_at: '2026-09-04T01:05:00.000Z',
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
  render(<QueryClientProvider client={client}><MemoryRouter><SupportTicketsPage /></MemoryRouter></QueryClientProvider>);

  await act(async () => { await vi.advanceTimersByTimeAsync(1); });
  expect(screen.getByText('Waiting for participant')).toBeVisible();
  await act(async () => { await vi.advanceTimersByTimeAsync(20_000); });

  expect(screen.getByText('Participant replied just now')).toBeVisible();
  expect(listRead).toBeGreaterThanOrEqual(2);
});
