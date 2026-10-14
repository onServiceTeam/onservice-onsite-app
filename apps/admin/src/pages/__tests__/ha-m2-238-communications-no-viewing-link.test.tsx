// HA-M2-238 (Milestone 2, P6-M2 fixer): when the API could not mint a link
// for a thread voice note (signing key unusable, database error), the admin
// thread view returns media with url null. Communications then says no
// viewing link was returned instead of showing a player that cannot play.
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const CONVERSATION_ID = '23800000-0000-4abc-8def-000000000238';
const BOOKING_ID = '33800000-0000-4abc-8def-000000000238';
const apiMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('@/lib/api', () => ({ default: apiMocks, getErrorMessage: () => 'Request failed' }));
vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));

import CommunicationsPage from '../CommunicationsPage';

it('HA-M2-238: a thread voice note with no minted link says no viewing link was returned and shows no player', async () => {
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
        providerName: 'Ramon Cruz',
        isActive: true,
        state: 'open',
        stateReason: null,
        stage: 'request',
        messages: [{
          id: 'message-voice-1',
          conversationId: CONVERSATION_ID,
          senderId: 'customer-1',
          senderName: 'Ana Reyes',
          senderRole: 'customer',
          content: '',
          messageType: 'voice',
          imageUrl: null,
          isRead: false,
          isFlagged: false,
          flagReviewedAt: null,
          reportedAt: null,
          reportReason: null,
          redactedAt: null,
          redactionReason: null,
          createdAt: '2026-10-14T02:00:00.000Z',
          caption: null,
          systemEvent: null,
          mediaId: 'media-voice-1',
          mediaDurationMs: 12000,
          // messaging.service mediaViewOf when no link was minted.
          media: { id: 'media-voice-1', kind: 'voice', mime: null, durationMs: 12000, url: null, expiresAt: null },
        }],
      } } };
    }
    throw new Error(`Unexpected GET ${url}`);
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  const view = render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/communications?conversationId=${CONVERSATION_ID}`]}>
        <CommunicationsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );

  expect(await screen.findByText('No viewing link was returned for this voice message.')).toBeInTheDocument();
  expect(screen.getByText('[voice 0:12]')).toBeInTheDocument();
  expect(screen.queryByLabelText('Voice message from Ana Reyes')).not.toBeInTheDocument();
  expect(view.container.querySelector('audio')).toBeNull();
});
