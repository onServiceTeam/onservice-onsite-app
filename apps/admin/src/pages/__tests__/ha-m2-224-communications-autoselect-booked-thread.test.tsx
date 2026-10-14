// HA-M2-224 (Milestone 2, P6-M2): a booking can carry one thread per provider
// who quoted. The Booking 360 "conversation" link (/communications?bookingId=)
// opens the booked provider's thread (stage 'booking') even when another
// provider's request thread is listed first.
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('@/lib/api', () => ({ default: apiMocks, getErrorMessage: () => 'Request failed' }));
vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));

import CommunicationsPage from '../CommunicationsPage';

function summary(id: string, providerName: string, stage: 'request' | 'booking', state: 'open' | 'read_only') {
  return {
    id,
    bookingId: 'booking-1',
    customerId: 'customer-1',
    customerName: 'Ana Reyes',
    providerId: `${id}-provider-user`,
    providerProfileId: `${id}-provider`,
    providerName,
    isActive: true,
    messageCount: 1,
    flaggedOpen: 0,
    reportedOpen: 0,
    lastMessageAt: '2026-10-14T03:00:00.000Z',
    lastMessagePreview: `${providerName} preview`,
    state,
    stateReason: state === 'read_only' ? 'other_provider_booked' : null,
    stage,
    createdAt: '2026-10-14T00:00:00.000Z',
    updatedAt: '2026-10-14T03:00:00.000Z',
  };
}

it('HA-M2-224: a booking link opens the booked provider thread, not a newer request thread listed first', async () => {
  apiMocks.get.mockImplementation(async (url: string) => {
    if (url === '/api/v1/admin/conversations/stats') {
      return { data: { data: { openFlagged: 0, openReported: 0 } } };
    }
    if (url === '/api/v1/admin/conversations') {
      return { data: { success: true, total: 2, conversations: [
        summary('conversation-request', 'Lito Ramos', 'request', 'read_only'),
        summary('conversation-booked', 'Ramon Cruz', 'booking', 'open'),
      ] } };
    }
    if (url === '/api/v1/admin/conversations/conversation-booked') {
      return { data: { success: true, data: {
        id: 'conversation-booked',
        bookingId: 'booking-1',
        customerId: 'customer-1',
        customerName: 'Ana Reyes',
        providerId: 'conversation-booked-provider-user',
        providerProfileId: 'conversation-booked-provider',
        providerName: 'Ramon Cruz',
        isActive: true,
        state: 'open',
        stateReason: null,
        stage: 'booking',
        messages: [{
          id: 'message-1', conversationId: 'conversation-booked', senderId: 'customer-1', senderName: 'Ana Reyes',
          senderRole: 'customer', content: 'See you tomorrow morning.', messageType: 'text', imageUrl: null,
          isRead: true, isFlagged: false, flagReviewedAt: null, reportedAt: null, reportReason: null,
          redactedAt: null, redactionReason: null, createdAt: '2026-10-14T02:00:00.000Z',
        }],
      } } };
    }
    if (url === '/api/v1/admin/conversations/conversation-request') {
      return { data: { success: true, data: {
        id: 'conversation-request', bookingId: 'booking-1', customerId: 'customer-1', customerName: 'Ana Reyes',
        providerId: 'p', providerProfileId: null, providerName: 'Lito Ramos', isActive: true, messages: [],
      } } };
    }
    throw new Error(`Unexpected GET ${url}`);
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/communications?bookingId=booking-1']}>
        <CommunicationsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );

  expect(await screen.findByText('See you tomorrow morning.')).toBeVisible();
  await waitFor(() => expect(apiMocks.get).toHaveBeenCalledWith('/api/v1/admin/conversations/conversation-booked'));
  expect(apiMocks.get).not.toHaveBeenCalledWith('/api/v1/admin/conversations/conversation-request');
});
