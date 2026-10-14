// HA-M2-221 (Milestone 2, P6-M2): a request thread opened in Communications
// shows its stage (request or booked job) and its state, and a read-only
// thread says why (state/stateReason/stage from messaging-admin.service,
// derived by request-thread.service THREAD_STATE_SQL).
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const CONVERSATION_ID = '22100000-0000-4abc-8def-000000000221';
const BOOKING_ID = '32100000-0000-4abc-8def-000000000221';
const apiMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('@/lib/api', () => ({ default: apiMocks, getErrorMessage: () => 'Request failed' }));
vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));

import CommunicationsPage from '../CommunicationsPage';

it('HA-M2-221: Communications shows the thread stage badge and its read-only state with the reason', async () => {
  apiMocks.get.mockImplementation(async (url: string) => {
    if (url === '/api/v1/admin/conversations/stats') {
      return { data: { data: { openFlagged: 0, openReported: 0 } } };
    }
    if (url === '/api/v1/admin/conversations') {
      return { data: { success: true, conversations: [], total: 0 } };
    }
    if (url === `/api/v1/admin/conversations/${CONVERSATION_ID}`) {
      return { data: { success: true, data: {
        id: CONVERSATION_ID,
        bookingId: BOOKING_ID,
        customerId: 'customer-1',
        customerName: 'Ana Reyes',
        providerId: 'provider-user-2',
        providerProfileId: 'provider-2',
        providerName: 'Lito Ramos',
        isActive: true,
        state: 'read_only',
        stateReason: 'quote_declined',
        stage: 'request',
        messages: [],
      } } };
    }
    throw new Error(`Unexpected GET ${url}`);
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/communications?conversationId=${CONVERSATION_ID}`]}>
        <CommunicationsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );

  const status = await screen.findByRole('group', { name: 'Thread status' });
  expect(within(status).getByText('Request stage')).toBeInTheDocument();
  expect(within(status).getByText('Read-only')).toBeInTheDocument();
  expect(within(status).queryByText('Booked job')).not.toBeInTheDocument();
  expect(screen.getByText(/Read-only: The customer declined this provider's quote\./)).toBeInTheDocument();
});
