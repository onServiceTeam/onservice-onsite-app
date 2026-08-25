import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import api from '@/lib/api';
import { mockCommunicationsApi, renderCommunicationsPage } from './communications-test-fixtures';

beforeEach(() => {
  mockCommunicationsApi();
  vi.mocked(api.get).mockImplementation(async (url: string) => {
    if (url === '/api/v1/admin/conversations/stats') return { data: { data: { openFlagged: 30, openReported: 30 } } } as never;
    if (url === '/api/v1/admin/conversations/queue') {
      return { data: { success: true, messages: [{
        id: 'message-1', conversationId: 'conversation-1', senderId: 'customer-1', senderName: 'Maria Santos',
        senderRole: 'customer', content: 'Review this message.', messageType: 'text', imageUrl: null,
        isRead: true, isFlagged: true, flagReviewedAt: null, reportedAt: null, reportReason: null,
        redactedAt: null, redactionReason: null, createdAt: '2026-08-23T08:00:00.000Z', bookingId: 'booking-1',
      }], total: 30 } } as never;
    }
    if (url === '/api/v1/admin/conversations') {
      return { data: { success: true, conversations: [], total: 0 } } as never;
    }
    return { data: { success: true, data: { messages: [] } } } as never;
  });
});

it('Bug UX-421 — communications review pages through every result and searches only after submission', async () => {
  renderCommunicationsPage();

  fireEvent.click(await screen.findByRole('button', { name: 'Next' }));
  await waitFor(() => expect(api.get).toHaveBeenCalledWith('/api/v1/admin/conversations/queue', {
    params: { scope: 'all', page: 2, pageSize: 25 },
  }));

  fireEvent.click(screen.getByRole('button', { name: 'All conversations' }));
  const search = screen.getByRole('textbox', { name: 'Search customer and provider conversations' });
  fireEvent.change(search, { target: { value: 'Maria' } });
  expect(api.get).not.toHaveBeenCalledWith('/api/v1/admin/conversations', expect.objectContaining({
    params: expect.objectContaining({ search: 'Maria' }),
  }));
  fireEvent.click(screen.getByRole('button', { name: 'Search' }));
  await waitFor(() => expect(api.get).toHaveBeenCalledWith('/api/v1/admin/conversations', {
    params: { filter: 'all', search: 'Maria', page: 1, pageSize: 25 },
  }));
});
