// HA-M2-212 (D38 Milestone 2, package P5a): on the website a pro can report
// a customer's message. Before, the provider chat used a long-press and
// Alert.alert, which does nothing in a browser; now a visible "Report" opens
// an in-app dialog whose reason reaches the moderation queue.
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Alert, Platform } from 'react-native';
import { getMessagesPage, openConversation, reportMessage } from '@/services/messaging.service';
import { CUSTOMER_ID, conversationFixture, messageFixture, pageOf } from '../test-support/chat-fixtures';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'booking-1' }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1280, breakpoint: 'desktop', isPhone: false, isTablet: false, isDesktop: true }),
}));
jest.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({ isAuthenticated: true, user: { id: 'provider-user-1', role: 'provider' } }),
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
  getInbox: jest.fn(), markConversationRead: jest.fn().mockResolvedValue(undefined), reportMessage: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@/services/booking.service', () => ({ getBookingById: jest.fn() }));

import ProviderChatScreen from '../app/provider/chat/[id]';

const platform = Platform as { OS: string };
const originalOS = platform.OS;
afterEach(() => { platform.OS = originalOS; });

it('HA-M2-212: provider Report opens the in-app reason dialog on the web, not Alert.alert', async () => {
  platform.OS = 'web';
  jest.mocked(openConversation).mockResolvedValue(conversationFixture({
    otherParty: { userId: CUSTOMER_ID, displayName: 'Maria S.', avatarUrl: null, role: 'customer' },
  }));
  jest.mocked(getMessagesPage).mockResolvedValue(pageOf([
    messageFixture('message-9', CUSTOMER_ID, 'Pay me on GCash instead.', '2026-10-14T01:00:00.000Z'),
  ]));

  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><ProviderChatScreen /></QueryClientProvider>);

  fireEvent.click(await screen.findByRole('button', { name: 'Report this message' }));
  expect(screen.getByRole('alert', { name: 'Report message reason' })).toBeTruthy();
  expect(Alert.alert).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole('button', { name: 'Report reason scam or off-app payment request' }));
  await waitFor(() => expect(reportMessage).toHaveBeenCalledWith('message-9', 'scam_or_off_platform'));
  expect(screen.queryByRole('alert', { name: 'Report message reason' })).toBeNull();
});
