// HA-M2-503 (D38 Milestone 2, package P5a review fix): messages arriving
// together in an open chat cost at most three API requests: mark the thread
// read, re-read the unread badge, re-read the inbox. The API allows 100 requests
// per user per 15 minutes. Before, the same message cost 9 (the badge and
// inbox hooks each re-read on every event, the chat's own read re-read both
// again, and the server's echo of that read, messages:read, re-read them a
// third time), so a busy chat could lock the account out of every screen.
// This test runs the real live-connection service against a fake socket,
// with the tab badge, the inbox and the chat mounted as in the app.
import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  getInbox,
  getMessagesPage,
  getUnreadCount,
  markConversationRead,
  openConversation,
} from '@/services/messaging.service';
import { connectSocket, __resetSocketForTests } from '@/services/socket.service';
import { useChatInbox, useChatUnreadCount } from '@/hooks/useChatInbox';
import { FakeSocket } from '../test-support/fake-socket';
import { CUSTOMER_ID, PROVIDER_USER_ID, conversationFixture, inboxItemFixture, messageFixture, pageOf } from '../test-support/chat-fixtures';

const mockIo = jest.fn();
jest.mock('socket.io-client', () => ({ io: (...args: unknown[]) => mockIo(...args) }));
jest.mock('@/services/secure-storage', () => ({ getAccessToken: () => 'access-token-1' }));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'booking-1', provider: 'provider-user-1' }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 390, breakpoint: 'phone', isPhone: true, isTablet: false, isDesktop: false }),
}));
jest.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({ isAuthenticated: true, user: { id: 'customer-user-1', role: 'customer' } }),
}));
jest.mock('@/services/messaging.service', () => ({
  openConversation: jest.fn(), getConversation: jest.fn(), getMessagesPage: jest.fn(), sendChatMessage: jest.fn(),
  getInbox: jest.fn(), getUnreadCount: jest.fn(), markConversationRead: jest.fn(), reportMessage: jest.fn(),
}));
jest.mock('@/services/booking.service', () => ({
  getBookingById: jest.fn().mockResolvedValue({ id: 'booking-1', status: 'quoted', serviceName: 'Aircon repair' }),
}));

import CustomerChatScreen from '../app/customer/chat/[id]';

/** The tab bar's Messages badge and the Messages tab, as the app keeps them mounted. */
function TabsStandIn(): null {
  useChatUnreadCount();
  useChatInbox();
  return null;
}

afterEach(() => {
  jest.useRealTimers();
  __resetSocketForTests();
});

it('HA-M2-503: messages arriving together on an open chat cost at most one read, one badge and one inbox request', async () => {
  jest.useFakeTimers();
  __resetSocketForTests();
  mockIo.mockImplementation((url: string, options: object) => new FakeSocket(url, options));
  const socket = connectSocket() as unknown as FakeSocket;
  socket.simulateConnect();

  jest.mocked(openConversation).mockResolvedValue(conversationFixture());
  jest.mocked(getMessagesPage).mockResolvedValue(pageOf([
    messageFixture('message-1', CUSTOMER_ID, 'Is Friday morning possible?', '2026-10-14T01:00:00.000Z'),
  ]));
  jest.mocked(getInbox).mockResolvedValue({ items: [inboxItemFixture()], meta: { total: 1, page: 1, pageSize: 50, totalPages: 1 } });
  jest.mocked(getUnreadCount).mockResolvedValue(0);
  jest.mocked(markConversationRead).mockResolvedValue(undefined);

  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <TabsStandIn />
      <CustomerChatScreen />
    </QueryClientProvider>,
  );
  await act(async () => { await jest.advanceTimersByTimeAsync(3_000); });
  expect(screen.getByText('Is Friday morning possible?')).toBeTruthy();

  jest.mocked(getInbox).mockClear();
  jest.mocked(getUnreadCount).mockClear();
  jest.mocked(markConversationRead).mockClear();

  // The pro replies with two quick messages. For each, the server sends the
  // message to the thread room and a message notice to the customer.
  const reply = messageFixture('message-2', PROVIDER_USER_ID, 'Yes, I can come at 9 AM.', '2026-10-14T01:02:00.000Z');
  const followUp = messageFixture('message-3', PROVIDER_USER_ID, 'I will bring the parts.', '2026-10-14T01:02:05.000Z');
  await act(async () => {
    socket.serve('new:message', reply);
    socket.serve('notification:message', { conversationId: 'conversation-1', bookingId: 'booking-1', stage: 'request' });
    await jest.advanceTimersByTimeAsync(300);
    socket.serve('new:message', followUp);
    socket.serve('notification:message', { conversationId: 'conversation-1', bookingId: 'booking-1', stage: 'request' });
    await jest.advanceTimersByTimeAsync(1_200);
  });
  // The chat marked the thread read; the server echoes it to the room.
  await act(async () => {
    socket.serve('messages:read', { conversationId: 'conversation-1', readBy: CUSTOMER_ID, count: 2 });
    await jest.advanceTimersByTimeAsync(5_000);
  });

  expect(screen.getByText('Yes, I can come at 9 AM.')).toBeTruthy();
  expect(screen.getByText('I will bring the parts.')).toBeTruthy();
  expect(markConversationRead).toHaveBeenCalledTimes(1);
  expect(getUnreadCount).toHaveBeenCalledTimes(1);
  expect(getInbox).toHaveBeenCalledTimes(1);
});
