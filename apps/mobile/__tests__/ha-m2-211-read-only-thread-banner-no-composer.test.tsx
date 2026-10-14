// HA-M2-211 (D38 Milestone 2, package P5a): a read-only thread (here, the
// customer declined this pro's quote) says why it is closed and has no
// message box; it can still be read.
import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { getMessagesPage, openConversation } from '@/services/messaging.service';
import { PROVIDER_USER_ID, conversationFixture, messageFixture, pageOf } from '../test-support/chat-fixtures';

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
  getBookingById: jest.fn().mockResolvedValue({ id: 'booking-1', status: 'requested', serviceName: 'Aircon repair' }),
}));

import CustomerChatScreen from '../app/customer/chat/[id]';

it('HA-M2-211: a read-only thread shows why it is closed and no message box', async () => {
  jest.mocked(openConversation).mockResolvedValue(conversationFixture({ state: 'read_only', stateReason: 'quote_declined' }));
  jest.mocked(getMessagesPage).mockResolvedValue({
    ...pageOf([messageFixture('message-1', PROVIDER_USER_ID, 'Here is my quote.', '2026-10-14T01:00:00.000Z')]),
    conversation: { id: 'conversation-1', state: 'read_only', stateReason: 'quote_declined' },
  });

  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><CustomerChatScreen /></QueryClientProvider>);

  expect(await screen.findByText('Here is my quote.')).toBeTruthy();
  expect(screen.getByText('You declined this pro’s quote, so this conversation is closed.')).toBeTruthy();
  expect(screen.getByText('You can still read it and report a message.')).toBeTruthy();
  expect(screen.queryByLabelText('Message to provider')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Send message' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Send a photo' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Report this message' })).toBeTruthy();
});
