// HA-M2-228 (Milestone 2, P6-M2): a voice message in a request thread plays
// in Communications through an <audio> player that uses the private signed
// link the admin thread view returns in message.media.
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const CONVERSATION_ID = '22800000-0000-4abc-8def-000000000228';
const BOOKING_ID = '32800000-0000-4abc-8def-000000000228';
const apiMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('@/lib/api', () => ({ default: apiMocks, getErrorMessage: () => 'Request failed' }));
vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));

import CommunicationsPage from '../CommunicationsPage';

it('HA-M2-228: a voice message in a thread plays through an audio player using its private link', async () => {
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
          media: {
            id: 'media-voice-1',
            kind: 'voice',
            url: '/api/v1/job-media/file/media-voice-1.admin.4070908800.sig',
            expiresAt: '2099-01-01T00:10:00.000Z',
            mime: 'audio/mp4',
            durationMs: 12000,
          },
        }],
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

  const player = await screen.findByLabelText('Voice message from Ana Reyes');
  expect(player.tagName).toBe('AUDIO');
  expect(player).toHaveAttribute('controls');
  expect(player).toHaveAttribute('src', '/api/v1/job-media/file/media-voice-1.admin.4070908800.sig');
  expect(screen.getByText('[voice 0:12]')).toBeInTheDocument();
  expect(screen.queryByText(/No viewing link was returned/)).not.toBeInTheDocument();
});
