// HA-M2-233 (Milestone 2, P6-M2 fixer): the admin thread view mints signed
// links for redacted messages' media too (messaging-admin.service.ts passes
// includeRedacted: true, "Admins see a redacted message's media too, as they
// see its content") and audit-logs that as job_media_viewed. So the page plays
// a redacted voice note for the admin, labelled as hidden from the customer
// and provider, rather than logging a view the screen never showed.
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const CONVERSATION_ID = '23300000-0000-4abc-8def-000000000233';
const BOOKING_ID = '33300000-0000-4abc-8def-000000000233';
const apiMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('@/lib/api', () => ({ default: apiMocks, getErrorMessage: () => 'Request failed' }));
vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));

import CommunicationsPage from '../CommunicationsPage';

it('HA-M2-233: a redacted voice note still plays for the admin, labelled as hidden from the participants', async () => {
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
        stage: 'booking',
        messages: [{
          id: 'message-voice-1',
          conversationId: CONVERSATION_ID,
          senderId: 'provider-user-1',
          senderName: 'Ramon Cruz',
          senderRole: 'provider',
          content: '',
          messageType: 'voice',
          imageUrl: null,
          isRead: true,
          isFlagged: false,
          flagReviewedAt: '2026-10-14T03:00:00.000Z',
          reportedAt: '2026-10-14T02:30:00.000Z',
          reportReason: 'harassment',
          redactedAt: '2026-10-14T03:00:00.000Z',
          redactionReason: 'Abusive language',
          createdAt: '2026-10-14T02:00:00.000Z',
          caption: null,
          systemEvent: null,
          mediaId: 'media-voice-1',
          mediaDurationMs: 9000,
          media: {
            id: 'media-voice-1',
            kind: 'voice',
            mime: 'audio/mp4',
            durationMs: 9000,
            url: '/api/v1/job-media/file/media-voice-1.admin.4070908800.sig',
            expiresAt: '2099-01-01T00:10:00.000Z',
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

  const player = await screen.findByLabelText('Voice message from Ramon Cruz');
  expect(player.tagName).toBe('AUDIO');
  expect(player).toHaveAttribute('src', '/api/v1/job-media/file/media-voice-1.admin.4070908800.sig');
  expect(screen.getByText(/Hidden from the customer and provider by a moderator\. Only admins can see or play it here/))
    .toBeInTheDocument();
  expect(screen.getByText('[voice 0:09]')).toBeInTheDocument();
  expect(screen.getByText('Redaction reason: Abusive language')).toBeInTheDocument();
});
