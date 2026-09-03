import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const CONVERSATION_ID = '11960000-0000-4abc-8def-000000001196';
const MESSAGE_ID = '21960000-0000-4abc-8def-000000001196';
const BOOKING_ID = '31960000-0000-4abc-8def-000000001196';
const apiMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('@/lib/api', () => ({ default: apiMocks, getErrorMessage: () => 'Request failed' }));
vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));

import CommunicationsPage from '../CommunicationsPage';

it('Bug UX-1196 - a valid uppercase message UUID focuses the canonical retained message', async () => {
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
        providerId: 'provider-user-1',
        providerProfileId: 'provider-1',
        providerName: 'Cebu Home Pro',
        isActive: true,
        messages: [{
          id: MESSAGE_ID,
          conversationId: CONVERSATION_ID,
          senderId: 'customer-1',
          senderName: 'Ana Reyes',
          senderRole: 'customer',
          content: 'Canonical retained message',
          messageType: 'text',
          imageUrl: null,
          isRead: true,
          isFlagged: false,
          flagReviewedAt: null,
          reportedAt: null,
          reportReason: null,
          redactedAt: null,
          redactionReason: null,
          createdAt: '2026-09-03T13:20:00.000Z',
        }],
      } } };
    }
    throw new Error(`Unexpected GET ${url}`);
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[
        `/communications?conversationId=${CONVERSATION_ID}&messageId=${MESSAGE_ID.toUpperCase()}`,
      ]}>
        <CommunicationsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );

  expect(await screen.findByText('Canonical retained message')).toBeVisible();
  expect(screen.getByText(MESSAGE_ID)).toBeVisible();
  expect(screen.queryByText('Message evidence unavailable')).not.toBeInTheDocument();
  expect(document.getElementById(`moderation-message-${MESSAGE_ID}`)).toHaveClass('ring-2');
});
