// HA-M2-206 (D38 Milestone 2, package P5a): a chat thread reads oldest to
// newest, and a message that arrives over the live connection lands at the
// bottom. Before, the screens reversed an already oldest-first page, so the
// newest message sat at the top while live messages were added at the bottom.
import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { getMessagesPage, openConversation } from '@/services/messaging.service';
import { CUSTOMER_ID, PROVIDER_USER_ID, conversationFixture, messageFixture, pageOf } from '../test-support/chat-fixtures';

const mockHandlers = new Map<string, Set<(payload: unknown) => void>>();

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
  subscribeSocketEvent: (event: string, handler: (payload: unknown) => void) => {
    if (!mockHandlers.has(event)) mockHandlers.set(event, new Set());
    mockHandlers.get(event)!.add(handler);
    return () => { mockHandlers.get(event)?.delete(handler); };
  },
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

it('HA-M2-206: messages render oldest to newest and a live message appears last', async () => {
  jest.mocked(openConversation).mockResolvedValue(conversationFixture());
  jest.mocked(getMessagesPage).mockResolvedValue(pageOf([
    messageFixture('message-1', CUSTOMER_ID, 'My bedroom aircon stopped cooling.', '2026-10-14T01:00:00.000Z'),
    messageFixture('message-2', PROVIDER_USER_ID, 'I can check it tomorrow morning.', '2026-10-14T01:05:00.000Z'),
  ]));

  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><CustomerChatScreen /></QueryClientProvider>);

  const first = await screen.findByText('My bedroom aircon stopped cooling.');
  const second = screen.getByText('I can check it tomorrow morning.');
  expect(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

  act(() => {
    mockHandlers.get('new:message')?.forEach((handler) => handler(
      messageFixture('message-3', PROVIDER_USER_ID, 'Is 9 AM okay?', '2026-10-14T01:07:00.000Z'),
    ));
  });
  const live = await screen.findByText('Is 9 AM okay?');
  expect(second.compareDocumentPosition(live) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});
