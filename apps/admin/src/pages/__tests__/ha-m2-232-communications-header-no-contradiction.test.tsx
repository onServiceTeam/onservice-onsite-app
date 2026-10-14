// HA-M2-232 (Milestone 2, P6-M2 fixer): D38 derives a thread's open or
// read-only state and never clears conversations.is_active, so a read-only
// thread still arrives with isActive true. The thread header must not say
// "conversation open" next to the "Read-only" badge; it reads "read-only".
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const CONVERSATION_ID = '23200000-0000-4abc-8def-000000000232';
const BOOKING_ID = '33200000-0000-4abc-8def-000000000232';
const apiMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('@/lib/api', () => ({ default: apiMocks, getErrorMessage: () => 'Request failed' }));
vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));

import CommunicationsPage from '../CommunicationsPage';

it('HA-M2-232: a read-only thread header says read-only, not "conversation open", even though is_active is still true', async () => {
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
        stateReason: 'other_provider_booked',
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

  const bookingLink = await screen.findByRole('link', { name: 'Booking 33200000' });
  const header = bookingLink.closest('p') as HTMLElement;
  expect(header).toHaveTextContent('Booking 33200000 · 0 message(s) · read-only');
  expect(screen.queryByText(/conversation open/)).not.toBeInTheDocument();
  expect(within(screen.getByRole('group', { name: 'Thread status' })).getByText('Read-only')).toBeInTheDocument();
});
