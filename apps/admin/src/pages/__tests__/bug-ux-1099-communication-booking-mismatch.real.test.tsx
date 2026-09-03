import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const BOOKING_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER_BOOKING_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const CONVERSATION_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const apiMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));

vi.mock('@/lib/api', () => ({ default: apiMocks, getErrorMessage: () => 'Request failed' }));
vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));

import CommunicationsPage from '../CommunicationsPage';

it('Bug UX-1099 - a conversation outside the recorded booking fails closed without exposing its content', async () => {
  apiMocks.get.mockImplementation(async (url: string) => {
    if (url === '/api/v1/admin/conversations/stats') return { data: { data: { openFlagged: 0, openReported: 0 } } };
    if (url === '/api/v1/admin/conversations') return { data: { conversations: [], total: 0 } };
    if (url === `/api/v1/admin/conversations/${CONVERSATION_ID}`) return { data: { data: {
      id: CONVERSATION_ID, bookingId: OTHER_BOOKING_ID, customerId: 'customer-1', customerName: 'Ana Reyes',
      providerId: 'provider-1', providerProfileId: null, providerName: 'Provider One', isActive: true,
      messages: [{
        id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', conversationId: CONVERSATION_ID,
        senderId: 'customer-1', senderName: 'Ana Reyes', senderRole: 'customer',
        content: 'Content from the wrong booking.', messageType: 'text', imageUrl: null,
        isRead: true, isFlagged: false, flagReviewedAt: null, reportedAt: null, reportReason: null,
        redactedAt: null, redactionReason: null, createdAt: '2026-09-03T10:00:00.000Z',
      }],
    } } };
    throw new Error(`Unexpected GET ${url}`);
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/communications?conversationId=${CONVERSATION_ID}&bookingId=${BOOKING_ID}`]}>
        <CommunicationsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );

  expect(await screen.findByText('Conversation evidence mismatch')).toBeVisible();
  expect(screen.getByText(/does not belong to the booking recorded in this link/)).toBeVisible();
  expect(screen.queryByText('Content from the wrong booking.')).not.toBeInTheDocument();
});
