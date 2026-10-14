// HA-M2-236 (Milestone 2, P6-M2 fixer): a private photo sent in a request
// thread shows in Communications from the signed link the admin thread view
// returns in message.media.url (D38 photos have no public imageUrl).
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const CONVERSATION_ID = '23600000-0000-4abc-8def-000000000236';
const BOOKING_ID = '33600000-0000-4abc-8def-000000000236';
const SIGNED_URL = '/api/v1/job-media/file/media-photo-1.admin.4070908800.sig';
const apiMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('@/lib/api', () => ({ default: apiMocks, getErrorMessage: () => 'Request failed' }));
vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));

import CommunicationsPage from '../CommunicationsPage';

it('HA-M2-236: a private photo in a thread renders from its signed media link', async () => {
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
          id: 'message-photo-1',
          conversationId: CONVERSATION_ID,
          senderId: 'customer-1',
          senderName: 'Ana Reyes',
          senderRole: 'customer',
          content: 'The leak is under the sink.',
          messageType: 'image',
          imageUrl: null,
          isRead: false,
          isFlagged: false,
          flagReviewedAt: null,
          reportedAt: null,
          reportReason: null,
          redactedAt: null,
          redactionReason: null,
          createdAt: '2026-10-14T02:00:00.000Z',
          caption: 'The leak is under the sink.',
          systemEvent: null,
          mediaId: 'media-photo-1',
          mediaDurationMs: null,
          media: {
            id: 'media-photo-1',
            kind: 'photo',
            mime: 'image/jpeg',
            durationMs: null,
            url: SIGNED_URL,
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

  const photo = await screen.findByRole('img', { name: 'Photo from Ana Reyes' });
  expect(photo).toHaveAttribute('src', SIGNED_URL);
  expect(photo.closest('a')).toHaveAttribute('href', SIGNED_URL);
  expect(screen.getByText('[photo] The leak is under the sink.')).toBeInTheDocument();
  expect(screen.queryByText(/No viewing link was returned/)).not.toBeInTheDocument();
});
