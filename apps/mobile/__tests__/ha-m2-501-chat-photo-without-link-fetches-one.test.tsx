// HA-M2-501 (D38 Milestone 2, package P5a review fix): when the server could
// not sign a viewing link for a chat photo it sends the message with
// media.url null (packages/api messaging.service mediaViewOf; signing is best
// effort). Before, the phone app ran null.startsWith while drawing the
// bubble and the whole chat crashed. Now the photo asks for a fresh link
// (GET /job-media/:id/url) and shows it.
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import api from '@/services/api';
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

it('HA-M2-501: a chat photo that arrives with no link fetches one instead of crashing the chat', async () => {
  jest.mocked(openConversation).mockResolvedValue(conversationFixture());
  jest.mocked(getMessagesPage).mockResolvedValue(pageOf([
    messageFixture('message-photo', PROVIDER_USER_ID, 'The cracked fitting', '2026-10-14T01:05:00.000Z', {
      messageType: 'image',
      caption: 'The cracked fitting',
      media: { id: 'media-31', kind: 'photo', durationMs: null, url: null, expiresAt: null },
    }),
  ]));
  jest.mocked(api.get).mockImplementation((async (url: string) => {
    if (url === '/api/v1/job-media/media-31/url') {
      return { data: { success: true, data: {
        url: '/api/v1/job-media/file/fresh-token-31', expiresAt: '2026-10-14T01:20:00.000Z',
        kind: 'photo', mime: 'image/jpeg', durationMs: null,
      } } };
    }
    return { data: {} };
  }) as never);

  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const { container } = render(<QueryClientProvider client={client}><CustomerChatScreen /></QueryClientProvider>);

  expect(await screen.findByText('The cracked fitting')).toBeTruthy();
  await waitFor(() => expect(container.querySelector('[accessibilitylabel="Chat photo"]')).not.toBeNull());
  const photo = container.querySelector('[accessibilitylabel="Chat photo"]')!;
  expect(photo.getAttribute('source')).toMatch(/^https?:\/\/.+\/api\/v1\/job-media\/file\/fresh-token-31$/);
  expect(jest.mocked(api.get)).toHaveBeenCalledWith('/api/v1/job-media/media-31/url');
});
