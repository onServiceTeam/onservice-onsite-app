import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import api from '@/lib/api';
import SupportTicketsPage from '../SupportTicketsPage';

it('Bug UX-060 — provider support cases are identified as providers and link to Provider 360', async () => {
  vi.mocked(api.get).mockImplementation(async (url: string) => {
    if (url === '/api/v1/support-tickets/summary') {
      return { data: { data: { open: 1, escalated: 0, urgent: 0, unassigned: 1 } } } as never;
    }
    if (url === '/api/v1/support-tickets/agents') {
      return { data: { data: [] } } as never;
    }
    return {
      data: {
        data: [{
          id: 'ticket-1',
          ticket_number: 'TKT-2001',
          user_id: 'provider-user-1',
          assigned_agent_id: null,
          type: 'booking_issue',
          status: 'open',
          priority: 'high',
          subject: 'Customer address is unclear',
          description: 'The provider needs help confirming the location.',
          booking_id: null,
          resolution_notes: null,
          resolved_at: null,
          closed_at: null,
          created_at: '2026-08-24T08:00:00.000Z',
          updated_at: '2026-08-24T08:00:00.000Z',
          user_role: 'provider',
          provider_id: 'provider-profile-1',
          provider_business_name: 'Cebu Prime Services',
          user_first_name: 'Pedro',
          user_last_name: 'S.',
          message_count: 0,
        }],
        meta: { total: 1 },
      },
    } as never;
  });

  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter><SupportTicketsPage /></MemoryRouter>
    </QueryClientProvider>,
  );

  const providerName = await screen.findByText('Cebu Prime Services · Pedro S.');
  const providerLink = providerName.closest('a');
  expect(providerLink).not.toBeNull();
  expect(providerLink).toHaveAttribute('to', '/providers/provider-profile-1');
  expect(screen.getByText('Provider')).toBeTruthy();
  expect(screen.getByRole('search')).toBeTruthy();
});
