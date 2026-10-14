// HA-M2-237 (Milestone 2, P6-M2 fixer): a thread's private voice link expires
// (the file route answers 410). When the player fails on a link that was live
// when the thread loaded and has expired since, Communications reloads the
// thread once and the player switches to the fresh link. Reloading is an
// audited view, so it never happens on a timer.
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const CONVERSATION_ID = '23700000-0000-4abc-8def-000000000237';
const BOOKING_ID = '33700000-0000-4abc-8def-000000000237';
const THREAD_URL = `/api/v1/admin/conversations/${CONVERSATION_ID}`;
const apiMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('@/lib/api', () => ({ default: apiMocks, getErrorMessage: () => 'Request failed' }));
vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));

import CommunicationsPage from '../CommunicationsPage';

function thread(token: string, expiresAt: string) {
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
        mime: 'audio/mp4',
        durationMs: 12000,
        url: `/api/v1/job-media/file/${token}`,
        expiresAt,
      },
    }],
  } } };
}

it('HA-M2-237: a thread voice link that expired while on screen reloads the thread once when it fails to play, and plays from the fresh link', async () => {
  let threadLoads = 0;
  apiMocks.get.mockImplementation(async (url: string) => {
    if (url === '/api/v1/admin/conversations/stats') {
      return { data: { data: { openFlagged: 0, openReported: 0 } } };
    }
    if (url === '/api/v1/admin/conversations') {
      return { data: { success: true, conversations: [], total: 0 } };
    }
    if (url === THREAD_URL) {
      threadLoads += 1;
      // Live when loaded, gone a moment later (real links last a few minutes).
      return threadLoads === 1
        ? thread('expiring-token', new Date(Date.now() + 800).toISOString())
        : thread('fresh-token', new Date(Date.now() + 600_000).toISOString());
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
  expect(player).toHaveAttribute('src', '/api/v1/job-media/file/expiring-token');
  expect(await screen.findByText(/The private photo and voice links in this thread have expired/, undefined, { timeout: 3000 }))
    .toBeInTheDocument();
  expect(threadLoads).toBe(1);

  fireEvent.error(player);

  await waitFor(() => {
    expect(screen.getByLabelText('Voice message from Ana Reyes'))
      .toHaveAttribute('src', '/api/v1/job-media/file/fresh-token');
  });
  expect(threadLoads).toBe(2);
  expect(screen.queryByText(/The private photo and voice links in this thread have expired/)).not.toBeInTheDocument();
});
