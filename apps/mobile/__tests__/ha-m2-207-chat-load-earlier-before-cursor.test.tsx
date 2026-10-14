// HA-M2-207 (D38 Milestone 2, package P5a): a long thread opens on its newest
// messages, and "Load earlier messages" asks for the page before the oldest
// one on screen (`before` cursor), which then shows above it.
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { getMessagesPage, openConversation } from '@/services/messaging.service';
import { CUSTOMER_ID, PROVIDER_USER_ID, conversationFixture, messageFixture, pageOf } from '../test-support/chat-fixtures';

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
jest.mock('@/services/socket.service', () => ({
  subscribeSocketEvent: () => () => undefined,
  onSocketStatus: () => () => undefined,
  isSocketConnected: () => true,
  joinConversation: jest.fn(), leaveConversation: jest.fn(),
  emitTypingStart: jest.fn(), emitTypingStop: jest.fn(), emitMarkRead: jest.fn(),
}));
jest.mock('@/services/messaging.service', () => ({
  openConversation: jest.fn(), getConversation: jest.fn(), getMessagesPage: jest.fn(), sendChatMessage: jest.fn(),
  getInbox: jest.fn(), markConversationRead: jest.fn().mockResolvedValue(undefined), reportMessage: jest.fn(),
}));
jest.mock('@/services/booking.service', () => ({
  getBookingById: jest.fn().mockResolvedValue({ id: 'booking-1', status: 'quoted', serviceName: 'Aircon repair' }),
}));

import CustomerChatScreen from '../app/customer/chat/[id]';

it('HA-M2-207: "Load earlier messages" requests before=<oldest id> and shows the older page first', async () => {
  jest.mocked(openConversation).mockResolvedValue(conversationFixture());
  jest.mocked(getMessagesPage)
    .mockResolvedValueOnce(pageOf([
      messageFixture('message-2', PROVIDER_USER_ID, 'Second message', '2026-10-14T01:05:00.000Z'),
      messageFixture('message-3', CUSTOMER_ID, 'Third message', '2026-10-14T01:06:00.000Z'),
    ], { hasMore: true, nextBefore: 'message-2' }))
    .mockResolvedValueOnce(pageOf([
      messageFixture('message-1', CUSTOMER_ID, 'First message', '2026-10-14T01:00:00.000Z'),
    ], { hasMore: false }));

  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><CustomerChatScreen /></QueryClientProvider>);

  expect(await screen.findByText('Second message')).toBeTruthy();
  expect(getMessagesPage).toHaveBeenNthCalledWith(1, 'conversation-1', { limit: 30 });
  fireEvent.click(screen.getByRole('button', { name: 'Load earlier messages' }));

  await waitFor(() => expect(getMessagesPage).toHaveBeenNthCalledWith(2, 'conversation-1', { before: 'message-2', limit: 30 }));
  const first = await screen.findByText('First message');
  // Query again: the jest FlatList stand-in reuses rows by position.
  const second = screen.getByText('Second message');
  const third = screen.getByText('Third message');
  expect(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(second.compareDocumentPosition(third) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Load earlier messages' })).toBeNull());
});
