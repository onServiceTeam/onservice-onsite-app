import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import { sendMessage } from '@/services/messaging.service';
import { uploadImages } from '@/services/upload.service';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'booking-chat' }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 820, isPhone: false, isTablet: true, isDesktop: false }),
}));
jest.mock('@/services/socket.service', () => ({
  connectSocket: () => ({ on: jest.fn() }),
  getSocket: () => null,
  joinConversation: jest.fn(),
  leaveConversation: jest.fn(),
  emitTypingStart: jest.fn(),
  emitTypingStop: jest.fn(),
  emitMarkRead: jest.fn(),
}));
jest.mock('@/services/messaging.service', () => ({
  getConversations: jest.fn().mockResolvedValue([{ id: 'conversation-chat', bookingId: 'booking-chat' }]),
  createConversation: jest.fn(),
  getMessages: jest.fn().mockResolvedValue({ messages: [], total: 0 }),
  sendMessage: jest.fn(),
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

it('Bug UX-372 — provider chat sends text and uploaded photo messages through the booking conversation', async () => {
  jest.mocked(sendMessage)
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
      imageUrl: 'https://app.onservice.ph/uploads/chat/evidence.jpg',
      isRead: false,
      createdAt: '2026-08-24T01:06:00.000Z',
    });
  jest.mocked(ImagePicker.requestMediaLibraryPermissionsAsync).mockResolvedValue({ status: 'granted' } as never);
  jest.mocked(ImagePicker.launchImageLibraryAsync).mockResolvedValue({
    canceled: false,
    assets: [{ uri: 'file:///provider-photo.jpg' }],
  } as never);
  jest.mocked(uploadImages).mockResolvedValue([
    { url: 'https://app.onservice.ph/uploads/chat/evidence.jpg', key: 'chat/evidence.jpg' },
  ] as never);

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
    expect(sendMessage).toHaveBeenCalledWith('conversation-chat', 'I am on my way.');
  });
  expect(await screen.findByText('I am on my way.')).toBeTruthy();

  fireEvent.click(screen.getByLabelText('Send a photo to customer'));
  await waitFor(() => {
    expect(uploadImages).toHaveBeenCalledWith(['file:///provider-photo.jpg'], 'chat');
    expect(sendMessage).toHaveBeenCalledWith(
      'conversation-chat',
      'Photo',
      'image',
      'https://app.onservice.ph/uploads/chat/evidence.jpg',
    );
  });
});
