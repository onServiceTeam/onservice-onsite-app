import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockGetConversations = jest.fn();
const mockCreateConversation = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));
jest.mock('@/stores/auth.store', () => ({ useAuthStore: (selector: (state: { user: null }) => unknown) => selector({ user: null }) }));
jest.mock('@/services/messaging.service', () => ({
  getConversations: (...args: unknown[]) => mockGetConversations(...args),
  createConversation: (...args: unknown[]) => mockCreateConversation(...args),
  getMessages: jest.fn(), sendMessage: jest.fn(), markConversationRead: jest.fn(), reportMessage: jest.fn(),
}));
jest.mock('@/services/booking.service', () => ({ getBookingById: jest.fn() }));
jest.mock('@/services/socket.service', () => ({
  connectSocket: jest.fn(), getSocket: jest.fn(), joinConversation: jest.fn(), leaveConversation: jest.fn(),
  emitTypingStart: jest.fn(), emitTypingStop: jest.fn(), emitMarkRead: jest.fn(),
}));
jest.mock('expo-image-picker', () => ({ requestMediaLibraryPermissionsAsync: jest.fn(), launchImageLibraryAsync: jest.fn() }));

import CustomerChatScreen from '../app/customer/chat/[id]';

it('Bug UX-635 — a chat link without a booking ID never attempts to create an unlinked conversation', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><CustomerChatScreen /></QueryClientProvider>);

  expect(screen.getByText('Booking chat unavailable')).toBeTruthy();
  await waitFor(() => expect(mockGetConversations).not.toHaveBeenCalled());
  expect(mockCreateConversation).not.toHaveBeenCalled();
});
