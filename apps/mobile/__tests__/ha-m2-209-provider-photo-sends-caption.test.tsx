// HA-M2-209 (D38 Milestone 2, package P5a): a pro who types a note and then
// sends a photo sends that note as the photo's caption. Before, the provider
// chat always sent the literal text "Photo", so the pro's words were lost.
// The photo goes up as private thread media (job-media purpose 'chat'), and
// the message names it by mediaId.
import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import api from '@/services/api';
import { getMessagesPage, openConversation, sendChatMessage } from '@/services/messaging.service';
import { CUSTOMER_ID, PROVIDER_USER_ID, conversationFixture, messageFixture, pageOf } from '../test-support/chat-fixtures';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'booking-1' }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 390, breakpoint: 'phone', isPhone: true, isTablet: false, isDesktop: false }),
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
  getInbox: jest.fn(), markConversationRead: jest.fn().mockResolvedValue(undefined), reportMessage: jest.fn(),
}));
jest.mock('@/services/booking.service', () => ({ getBookingById: jest.fn() }));
jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(),
  requestMediaLibraryPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
}));

import ProviderChatScreen from '../app/provider/chat/[id]';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const fileSystem = require('expo-file-system') as { __setMockFile: (uri: string, bytes: Uint8Array) => void };
const PHOTO = 'file:///tmp/cache/ImagePicker/drain-pipe.jpg';

it('HA-M2-209: a provider photo sends the typed caption with the uploaded mediaId', async () => {
  fileSystem.__setMockFile(PHOTO, new Uint8Array(2048));
  jest.mocked(openConversation).mockResolvedValue(conversationFixture({
    otherParty: { userId: CUSTOMER_ID, displayName: 'Maria S.', avatarUrl: null, role: 'customer' },
  }));
  jest.mocked(getMessagesPage).mockResolvedValue(pageOf([
    messageFixture('message-1', CUSTOMER_ID, 'Can you show me the part?', '2026-10-14T01:00:00.000Z'),
  ]));
  jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValue({
    canceled: false,
    assets: [{ uri: PHOTO, width: 1024, height: 768, type: 'image', mimeType: 'image/jpeg', fileSize: 2048 }],
  } as never);
  jest.mocked(api.post).mockImplementation((async (url: string) => {
    if (url === '/api/v1/job-media') {
      return { data: { success: true, data: {
        id: 'media-chat-1', status: 'uploading', kind: 'photo', purpose: 'chat', chunkBytes: 2097152,
        totalChunks: 1, bytesReceived: 0, nextIndex: 0, rejectionCode: null, limits: { bytes: 10485760, durationMs: null },
      } } };
    }
    return { data: { success: true, data: { id: 'media-chat-1', status: 'stored', kind: 'photo' } } };
  }) as never);
  jest.mocked(api.put).mockImplementation((async () => ({ data: { success: true, data: { bytesReceived: 2048, nextIndex: 1, complete: true } } })) as never);
  jest.mocked(sendChatMessage).mockResolvedValue(messageFixture('message-2', PROVIDER_USER_ID, 'This is the part I would replace.', '2026-10-14T01:02:00.000Z', {
    messageType: 'image',
    caption: 'This is the part I would replace.',
    media: { id: 'media-chat-1', kind: 'photo', durationMs: null, url: '/api/v1/job-media/file/token-c1', expiresAt: '2026-10-14T01:12:00.000Z' },
  }));

  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><ProviderChatScreen /></QueryClientProvider>);

  fireEvent.change(await screen.findByLabelText('Message to customer'), { target: { value: 'This is the part I would replace.' } });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Send a photo to customer' })); });

  await waitFor(() => expect(sendChatMessage).toHaveBeenCalledTimes(1));
  expect(sendChatMessage).toHaveBeenCalledWith('conversation-1', {
    messageType: 'image',
    content: 'This is the part I would replace.',
    mediaId: 'media-chat-1',
    clientMessageId: expect.any(String),
  });
  expect(jest.mocked(api.post).mock.calls[0]![1]).toMatchObject({ purpose: 'chat', conversationId: 'conversation-1', kind: 'photo', mime: 'image/jpeg' });
  expect(await screen.findByText('This is the part I would replace.')).toBeTruthy();
  expect(screen.queryByText('Photo')).toBeNull();
});
