// HA-M2-235 (Milestone 2, P6-M2 fixer): D38 voice notes are sent with an
// empty caption, so a reported voice note in the Review queue (the default
// tab) must say it is a voice note and how long it is, using the messageType
// and mediaDurationMs the queue endpoint returns, instead of a blank row.
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('@/lib/api', () => ({ default: apiMocks, getErrorMessage: () => 'Request failed' }));
vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));

import CommunicationsPage from '../CommunicationsPage';

it('HA-M2-235: a reported voice note in the review queue reads "[voice m:ss]" instead of a blank row', async () => {
  apiMocks.get.mockImplementation(async (url: string) => {
    if (url === '/api/v1/admin/conversations/stats') {
      return { data: { data: { openFlagged: 0, openReported: 1 } } };
    }
    if (url === '/api/v1/admin/conversations/queue') {
      return { data: { success: true, total: 1, messages: [{
        id: 'message-voice-1',
        conversationId: 'conversation-1',
        senderId: 'customer-1',
        senderName: 'Ana Reyes',
        senderRole: 'customer',
        content: '',
        messageType: 'voice',
        imageUrl: null,
        isRead: true,
        isFlagged: false,
        flagReviewedAt: null,
        reportedAt: '2026-10-14T02:30:00.000Z',
        reportReason: 'harassment',
        redactedAt: null,
        redactionReason: null,
        createdAt: '2026-10-14T02:00:00.000Z',
        caption: null,
        systemEvent: null,
        mediaId: 'media-voice-1',
        mediaDurationMs: 75000,
        // The queue never mints links (messaging-admin.service listModerationQueue).
        media: { id: 'media-voice-1', kind: 'voice', mime: null, durationMs: 75000, url: null, expiresAt: null },
        bookingId: 'booking-1',
      }] } };
    }
    throw new Error(`Unexpected GET ${url}`);
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <CommunicationsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );

  const row = (await screen.findByText('Ana Reyes (customer)')).closest('button') as HTMLElement;
  expect(row).toHaveTextContent('[voice 1:15]');
  expect(row).toHaveTextContent('Reason: harassment');
});
