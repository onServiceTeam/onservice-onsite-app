import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import api from '@/services/api';
import { sendChatMessage } from '@/services/messaging.service';
import { uploadImages } from '@/services/upload.service';

// D38 Milestone 2 (package P5a): updated. This test used to pin the provider
// photo going up as a PUBLIC chat upload and being sent as the literal text
// 'Photo' with its public imageUrl. Thread photos are now private job media
// (job-media purpose 'chat', uploaded in chunks) and the message names the
// photo by mediaId, with whatever the pro typed as its caption (none here).
// The public upload service is no longer used. Text sends go through the
// same thread with an idempotency key.
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'booking-chat' }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 820, isPhone: false, isTablet: true, isDesktop: false }),
}));
jest.mock('@/stores/auth.store', () => ({
  useAuthStore: (selector: (state: unknown) => unknown) => selector({ isAuthenticated: true, user: { id: 'provider-user', role: 'provider' } }),
}));
jest.mock('@/services/socket.service', () => ({
  subscribeSocketEvent: () => () => undefined,
  onSocketStatus: () => () => undefined,
  isSocketConnected: () => true,
  joinConversation: jest.fn(),
  leaveConversation: jest.fn(),
  emitTypingStart: jest.fn(),
  emitTypingStop: jest.fn(),
  emitMarkRead: jest.fn(),
}));
jest.mock('@/services/messaging.service', () => ({
  openConversation: jest.fn().mockResolvedValue({
    id: 'conversation-chat', bookingId: 'booking-chat', state: 'open', stateReason: null, stage: 'booking',
    otherParty: { userId: 'customer-user', displayName: 'Paolo G.', avatarUrl: null, role: 'customer' },
  }),
  getConversation: jest.fn(),
  getMessagesPage: jest.fn().mockResolvedValue({ messages: [], hasMore: false, nextBefore: null, conversation: null }),
  sendChatMessage: jest.fn(),
  getInbox: jest.fn(),
  markConversationRead: jest.fn().mockResolvedValue(undefined),
  reportMessage: jest.fn(),
}));
jest.mock('@/services/booking.service', () => ({
  getBookingById: jest.fn().mockResolvedValue({
    id: 'booking-chat',
    status: 'provider_en_route',
    serviceName: 'Aircon Cleaning',
    customerName: 'Paolo Garcia',
    scheduledAt: '2026-08-24T01:00:00.000Z',
    address: '88 Banilad Road',
    city: 'Mandaue City',
  }),
}));
jest.mock('@/services/upload.service', () => ({
  uploadImages: jest.fn(),
}));
jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));

import ProviderChatScreen from '../app/provider/chat/[id]';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const fileSystem = require('expo-file-system') as { __setMockFile: (uri: string, bytes: Uint8Array) => void };

it('Bug UX-372 — provider chat sends text and uploaded photo messages through the booking conversation', async () => {
  fileSystem.__setMockFile('file:///provider-photo.jpg', new Uint8Array(4096));
  jest.mocked(sendChatMessage)
    .mockResolvedValueOnce({
      id: 'message-text',
      conversationId: 'conversation-chat',
      senderId: 'provider-user',
      content: 'I am on my way.',
      messageType: 'text',
      imageUrl: null,
      isRead: false,
      createdAt: '2026-08-24T01:05:00.000Z',
    })
    .mockResolvedValueOnce({
      id: 'message-photo',
      conversationId: 'conversation-chat',
      senderId: 'provider-user',
      content: 'Photo',
      messageType: 'image',
      imageUrl: null,
      caption: null,
      media: { id: 'media-photo', kind: 'photo', durationMs: null, url: '/api/v1/job-media/file/token-photo', expiresAt: '2026-08-24T01:16:00.000Z' },
      isRead: false,
      createdAt: '2026-08-24T01:06:00.000Z',
    });
  jest.mocked(ImagePicker.requestMediaLibraryPermissionsAsync).mockResolvedValue({ status: 'granted' } as never);
  jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValue({
    canceled: false,
    assets: [{ uri: 'file:///provider-photo.jpg', width: 800, height: 600, mimeType: 'image/jpeg', fileSize: 4096 }],
  } as never);
  jest.mocked(api.post).mockImplementation((async (url: string) => {
    if (url === '/api/v1/job-media') {
      return { data: { success: true, data: {
        id: 'media-photo', status: 'uploading', kind: 'photo', purpose: 'chat', chunkBytes: 2097152,
        totalChunks: 1, bytesReceived: 0, nextIndex: 0, rejectionCode: null, limits: { bytes: 10485760, durationMs: null },
      } } };
    }
    return { data: { success: true, data: { id: 'media-photo', status: 'stored', kind: 'photo' } } };
  }) as never);
  jest.mocked(api.put).mockImplementation((async () => ({ data: { success: true, data: { bytesReceived: 4096, nextIndex: 1, complete: true } } })) as never);

  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(
    <QueryClientProvider client={client}>
      <ProviderChatScreen />
    </QueryClientProvider>,
  );

  const input = await screen.findByLabelText('Message to customer');
  fireEvent.change(input, { target: { value: 'I am on my way.' } });
  fireEvent.click(screen.getByLabelText('Send message to customer'));

  await waitFor(() => {
    expect(sendChatMessage).toHaveBeenCalledWith('conversation-chat', {
      messageType: 'text', content: 'I am on my way.', clientMessageId: expect.any(String),
    });
  });
  expect(await screen.findByText('I am on my way.')).toBeTruthy();

  await act(async () => { fireEvent.click(screen.getByLabelText('Send a photo to customer')); });
  await waitFor(() => {
    expect(sendChatMessage).toHaveBeenCalledWith('conversation-chat', {
      messageType: 'image', content: '', mediaId: 'media-photo', clientMessageId: expect.any(String),
    });
  });
  expect(jest.mocked(api.post).mock.calls[0]![1]).toMatchObject({ purpose: 'chat', conversationId: 'conversation-chat', kind: 'photo' });
  expect(uploadImages).not.toHaveBeenCalled();
});
