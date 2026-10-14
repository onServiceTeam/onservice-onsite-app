// HA-M2-215 (D38 Milestone 2, package P5a): a booking can have one thread per
// pro, so the customer's chat route names the pro (?provider=<user id>): an
// inbox tap and a "new message" notice both open
// /customer/chat/<booking>?provider=<pro>, and the chat screen asks the
// server for that pro's thread.
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { getInbox, getMessagesPage, openConversation } from '@/services/messaging.service';
import { resolveNotificationRoute } from '@/utils/notification-navigation';
import { conversationFixture, inboxItemFixture, pageOf } from '../test-support/chat-fixtures';

const mockPush = jest.fn();
let mockParams: Record<string, string> = {};

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => mockParams,
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
  getInbox: jest.fn(), getUnreadCount: jest.fn(), markConversationRead: jest.fn().mockResolvedValue(undefined), reportMessage: jest.fn(),
}));
jest.mock('@/services/booking.service', () => ({
  getBookingById: jest.fn().mockResolvedValue({ id: 'booking-1', status: 'quoted', serviceName: 'Aircon repair' }),
}));

import CustomerMessagesScreen from '../app/(tabs)/messages';
import CustomerChatScreen from '../app/customer/chat/[id]';

it('HA-M2-215: the customer chat route carries ?provider= from the inbox and notices into the thread request', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  jest.mocked(getInbox).mockResolvedValue({ items: [inboxItemFixture()], meta: { total: 1, page: 1, pageSize: 50, totalPages: 1 } });
  const inbox = render(<QueryClientProvider client={client}><CustomerMessagesScreen /></QueryClientProvider>);
  fireEvent.click(await screen.findByRole('button', { name: 'Ana R.' }));
  expect(mockPush).toHaveBeenCalledWith('/customer/chat/booking-1?provider=provider-user-1');
  inbox.unmount();

  expect(resolveNotificationRoute('new_message', {
    conversationId: 'conversation-1', bookingId: 'booking-1', stage: 'request', providerUserId: 'provider-user-1',
  }, 'customer')).toBe('/customer/chat/booking-1?provider=provider-user-1');

  mockParams = { id: 'booking-1', provider: 'provider-user-1' };
  jest.mocked(openConversation).mockResolvedValue(conversationFixture());
  jest.mocked(getMessagesPage).mockResolvedValue(pageOf([]));
  render(<QueryClientProvider client={client}><CustomerChatScreen /></QueryClientProvider>);
  await waitFor(() => expect(openConversation).toHaveBeenCalledWith({ bookingId: 'booking-1', providerUserId: 'provider-user-1' }));
  expect(await screen.findByText('Ana R.')).toBeTruthy();
});
