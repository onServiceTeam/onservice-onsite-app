import React from 'react';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import api from '@/lib/api';
import CommunicationsPage from '../CommunicationsPage';

export const reportedMessage = {
  id: 'message-1',
  conversationId: 'conversation-1',
  senderId: 'customer-1',
  senderName: 'Maria Santos',
  senderRole: 'customer',
  content: 'Please pay me outside the app.',
  messageType: 'text',
  imageUrl: null,
  isRead: true,
  isFlagged: true,
  flagReviewedAt: null,
  reportedAt: '2026-08-23T08:00:00.000Z',
  reportReason: 'scam_or_off_platform',
  redactedAt: null,
  redactionReason: null,
  createdAt: '2026-08-23T07:55:00.000Z',
  bookingId: 'booking-1',
};

export const conversationThread = {
  id: 'conversation-1',
  bookingId: 'booking-1',
  customerId: 'customer-1',
  customerName: 'Maria Santos',
  providerId: 'provider-user-1',
  providerProfileId: 'provider-1',
  providerName: 'Roberto Villanueva',
  isActive: true,
  messages: [reportedMessage],
};

export function mockCommunicationsApi(): void {
  vi.mocked(api.get).mockReset();
  vi.mocked(api.post).mockReset();
  vi.mocked(api.get).mockImplementation(async (url: string) => {
    if (url === '/api/v1/admin/conversations/stats') {
      return { data: { data: { openFlagged: 1, openReported: 1 } } } as never;
    }
    if (url === '/api/v1/admin/conversations/queue') {
      return { data: { success: true, messages: [reportedMessage], total: 1 } } as never;
    }
    if (url === '/api/v1/admin/conversations/conversation-1') {
      return { data: { success: true, data: conversationThread } } as never;
    }
    return { data: { success: true, conversations: [], total: 0 } } as never;
  });
  vi.mocked(api.post).mockResolvedValue({ data: { success: true } } as never);
}

export function renderCommunicationsPage(): ReturnType<typeof render> {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <CommunicationsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
