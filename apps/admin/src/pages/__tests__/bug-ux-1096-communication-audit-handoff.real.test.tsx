import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';

const BOOKING_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CONVERSATION_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const MESSAGE_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const apiMocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));

vi.mock('@/lib/api', () => ({ default: apiMocks, getErrorMessage: () => 'Request failed' }));
vi.mock('react-router-dom', async () => vi.importActual('react-router-dom'));

import AuditLogPage from '../AuditLogPage';
import CommunicationsPage from '../CommunicationsPage';

it('Bug UX-1096 - a moderation audit event opens the exact retained message even when the conversation list fails', async () => {
  apiMocks.get.mockImplementation(async (url: string) => {
    if (url === '/api/v1/admin/audit-log') return { data: { data: [{
      id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', source: 'admin_actions', userId: 'admin-1',
      userEmail: 'o***@example.com', userRole: 'super_admin', action: 'message_redacted',
      entityType: 'booking', entityId: BOOKING_ID, targetConversationId: CONVERSATION_ID,
      targetMessageId: MESSAGE_ID, oldValues: null, newValues: { messageId: MESSAGE_ID },
      ipAddress: null, userAgent: null, reason: null, createdAt: '2026-09-03T11:00:00.000Z',
    }], pagination: { page: 1, pageSize: 50, total: 1, totalPages: 1 } } };
    if (url === '/api/v1/admin/conversations/stats') {
      return { data: { data: { openFlagged: 0, openReported: 0 } } };
    }
    if (url === `/api/v1/admin/conversations/${CONVERSATION_ID}`) return { data: { data: {
      id: CONVERSATION_ID, bookingId: BOOKING_ID, customerId: 'customer-1', customerName: 'Ana Reyes',
      providerId: 'provider-user-1', providerProfileId: 'provider-1', providerName: 'Cebu Home Pro',
      isActive: true, messages: [{
        id: MESSAGE_ID, conversationId: CONVERSATION_ID, senderId: 'customer-1', senderName: 'Ana Reyes',
        senderRole: 'customer', content: 'Please pay outside the app.', messageType: 'text', imageUrl: null,
        isRead: true, isFlagged: true, flagReviewedAt: '2026-09-03T11:00:00.000Z',
        reportedAt: '2026-09-03T10:00:00.000Z', reportReason: 'off_platform',
        redactedAt: '2026-09-03T11:00:00.000Z', redactionReason: 'Unsafe payment request',
        createdAt: '2026-09-03T10:00:00.000Z',
      }],
    } } };
    if (url === '/api/v1/admin/conversations') throw new Error('List unavailable');
    throw new Error(`Unexpected GET ${url}`);
  });

  const auditClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const audit = render(
    <QueryClientProvider client={auditClient}><MemoryRouter><AuditLogPage /></MemoryRouter></QueryClientProvider>,
  );
  const expectedUrl = `/communications?conversationId=${CONVERSATION_ID}&bookingId=${BOOKING_ID}&messageId=${MESSAGE_ID}`;
  expect(await screen.findByRole('link', { name: /Open exact conversation message/ })).toHaveAttribute('href', expectedUrl);
  audit.unmount();

  const communicationsClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={communicationsClient}>
      <MemoryRouter initialEntries={[expectedUrl]}><CommunicationsPage /></MemoryRouter>
    </QueryClientProvider>,
  );
  expect(await screen.findByText('Please pay outside the app.')).toBeVisible();
  expect(screen.getByText('Selected audit evidence')).toBeVisible();
  expect(screen.getByText(MESSAGE_ID)).toBeVisible();
  expect(await screen.findByText('Failed to load conversations')).toBeVisible();
});
