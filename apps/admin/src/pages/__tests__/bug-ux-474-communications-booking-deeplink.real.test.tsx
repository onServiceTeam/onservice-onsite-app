import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const setSearchParamsMock = vi.hoisted(() => vi.fn());
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('react-router-dom');
  return { ...actual, useSearchParams: () => [new URLSearchParams('bookingId=booking-1'), setSearchParamsMock] };
});

const apiMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('@/lib/api', () => ({ default: apiMocks, getErrorMessage: () => 'Request failed' }));

import CommunicationsPage from '../CommunicationsPage';

it('Bug UX-474 — a booking deep-link filters communications and automatically opens the exact customer-provider thread', async () => {
  apiMocks.get.mockImplementation(async (url: string) => {
    if (url.endsWith('/stats')) return { data: { data: { openFlagged: 0, openReported: 0 } } };
    if (url.endsWith('/conversation-1')) return { data: { success: true, data: {
      id: 'conversation-1', bookingId: 'booking-1', customerId: 'customer-1', customerName: 'Ana Reyes',
      providerId: 'provider-1', providerName: 'Cebu Home Pro', isActive: true,
      messages: [{
        id: 'message-1', conversationId: 'conversation-1', senderId: 'customer-1', senderName: 'Ana Reyes',
        senderRole: 'customer', content: 'The provider is on the way now.', messageType: 'text', imageUrl: null,
        isRead: true, isFlagged: false, flagReviewedAt: null, reportedAt: null, reportReason: null,
        redactedAt: null, redactionReason: null, createdAt: '2026-08-30T01:00:00.000Z',
      }],
    } } };
    return { data: { success: true, conversations: [{
      id: 'conversation-1', bookingId: 'booking-1', customerId: 'customer-1', customerName: 'Ana Reyes',
      providerId: 'provider-1', providerName: 'Cebu Home Pro', isActive: true, messageCount: 1,
      flaggedOpen: 0, reportedOpen: 0, lastMessageAt: '2026-08-30T01:00:00.000Z',
      lastMessagePreview: 'The provider is on the way now.', createdAt: '2026-08-30T00:00:00.000Z',
      updatedAt: '2026-08-30T01:00:00.000Z',
    }], total: 1 } };
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(<QueryClientProvider client={client}><MemoryRouter><CommunicationsPage /></MemoryRouter></QueryClientProvider>);

  expect(screen.getByText('Booking conversation')).toBeVisible();
  expect(screen.getByText('booking-1')).toBeVisible();
  expect(await screen.findByText('The provider is on the way now.')).toBeVisible();
  await waitFor(() => expect(apiMocks.get).toHaveBeenCalledWith('/api/v1/admin/conversations', {
    params: { filter: 'all', search: 'booking-1', page: 1, pageSize: 25 },
  }));
});
