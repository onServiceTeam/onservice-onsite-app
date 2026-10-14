// HA-M2-214 (D38 Milestone 2, package P5a): the customer's Messages tab lists
// one thread per pro, with an unread count on threads that have new
// messages and "Read-only" on a closed thread.
import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { getInbox } from '@/services/messaging.service';
import { inboxItemFixture } from '../test-support/chat-fixtures';

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }) }));
jest.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({ isAuthenticated: true, user: { id: 'customer-user-1', role: 'customer' } }),
}));
jest.mock('@/services/socket.service', () => ({
  subscribeSocketEvent: () => () => undefined,
  onSocketStatus: () => () => undefined,
  isSocketConnected: () => true,
}));
jest.mock('@/services/messaging.service', () => ({ getInbox: jest.fn(), getUnreadCount: jest.fn() }));

import CustomerMessagesScreen from '../app/(tabs)/messages';

it('HA-M2-214: the inbox shows the unread badge and the read-only label', async () => {
  jest.mocked(getInbox).mockResolvedValue({
    items: [
      inboxItemFixture({ id: 'conversation-1', unreadCount: 3 }),
      inboxItemFixture({
        id: 'conversation-2',
        bookingId: 'booking-2',
        state: 'read_only',
        stateReason: 'other_provider_booked',
        unreadCount: 0,
        otherParty: { userId: 'provider-user-2', displayName: 'Ben C.', avatarUrl: null, role: 'provider' },
        lastMessage: { preview: 'Thanks anyway.', messageType: 'text', senderIsMe: false, createdAt: '2026-10-14T00:10:00.000Z' },
      }),
    ],
    meta: { total: 2, page: 1, pageSize: 50, totalPages: 1 },
  });

  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><CustomerMessagesScreen /></QueryClientProvider>);

  const open = await screen.findByRole('button', { name: 'Ana R., 3 unread' });
  expect(within(open).getByLabelText('3 unread').textContent).toBe('3');
  expect(within(open).queryByText('Read-only')).toBeNull();
  expect(within(open).getByText('I can come tomorrow morning.')).toBeTruthy();

  const closed = screen.getByRole('button', { name: 'Ben C., read-only' });
  expect(within(closed).getByText('Read-only')).toBeTruthy();
  expect(within(closed).queryByLabelText(/unread/)).toBeNull();
  expect(getInbox).toHaveBeenCalledWith({ state: 'all', pageSize: 50 });
});
