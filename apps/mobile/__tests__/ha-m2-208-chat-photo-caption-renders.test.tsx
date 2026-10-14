// HA-M2-208 (D38 Milestone 2, package P5a): a photo sent with a caption shows
// the caption under the photo. Before, the chat drew either the photo or the
// text, so a caption sent with a photo was never shown.
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
  getBookingById: jest.fn().mockResolvedValue({ id: 'booking-1', status: 'quoted', serviceName: 'Aircon repair' }),
}));

import CustomerChatScreen from '../app/customer/chat/[id]';

it('HA-M2-208: a photo caption renders under the photo', async () => {
  jest.mocked(openConversation).mockResolvedValue(conversationFixture());
  jest.mocked(getMessagesPage).mockResolvedValue(pageOf([
    messageFixture('message-photo', PROVIDER_USER_ID, 'This is the drain pipe I would replace.', '2026-10-14T01:05:00.000Z', {
      messageType: 'image',
      caption: 'This is the drain pipe I would replace.',
      media: {
        id: 'media-9', kind: 'photo', durationMs: null,
        url: '/api/v1/job-media/file/signed-token-9', expiresAt: '2026-10-14T01:15:00.000Z',
      },
    }),
  ]));

  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const { container } = render(<QueryClientProvider client={client}><CustomerChatScreen /></QueryClientProvider>);

  const caption = await screen.findByText('This is the drain pipe I would replace.');
  const photo = container.querySelector('[accessibilitylabel="Chat photo"]');
  expect(photo).not.toBeNull();
  expect(photo!.getAttribute('source')).toContain('/api/v1/job-media/file/signed-token-9');
  expect(photo!.compareDocumentPosition(caption) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(screen.queryByText('Photo')).toBeNull();
});
