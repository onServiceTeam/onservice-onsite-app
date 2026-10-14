// HA-M2-213 (D38 Milestone 2, package P5a): while the live connection is
// down, an open chat asks for anything newer than its newest message
// (`after`) every 20 seconds, so messages still arrive without phone push.
// It never polls faster than that (the API allows 100 requests per user per
// 15 minutes).
import React from 'react';
import { act, render, screen } from '@testing-library/react';
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
  isSocketConnected: () => false,
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

afterEach(() => { jest.useRealTimers(); });

it('HA-M2-213: a disconnected chat polls with after=<newest id> every 20 s', async () => {
  jest.useFakeTimers();
  jest.mocked(openConversation).mockResolvedValue(conversationFixture());
  jest.mocked(getMessagesPage).mockResolvedValueOnce(pageOf([
    messageFixture('message-1', CUSTOMER_ID, 'Are you free on Friday?', '2026-10-14T01:00:00.000Z'),
    messageFixture('message-2', PROVIDER_USER_ID, 'Yes, from 9 AM.', '2026-10-14T01:05:00.000Z'),
  ]));
  jest.mocked(getMessagesPage).mockResolvedValue(pageOf([
    messageFixture('message-3', PROVIDER_USER_ID, 'I will bring a ladder.', '2026-10-14T01:06:00.000Z'),
  ]));

  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><CustomerChatScreen /></QueryClientProvider>);
  await act(async () => { await jest.advanceTimersByTimeAsync(50); });
  expect(screen.getByText('Yes, from 9 AM.')).toBeTruthy();
  expect(getMessagesPage).toHaveBeenCalledTimes(1);

  await act(async () => { await jest.advanceTimersByTimeAsync(19_000); });
  expect(getMessagesPage).toHaveBeenCalledTimes(1);

  await act(async () => { await jest.advanceTimersByTimeAsync(1_100); });
  expect(getMessagesPage).toHaveBeenCalledTimes(2);
  expect(getMessagesPage).toHaveBeenLastCalledWith('conversation-1', { after: 'message-2', limit: 100 });
  expect(screen.getByText('I will bring a ladder.')).toBeTruthy();
});
