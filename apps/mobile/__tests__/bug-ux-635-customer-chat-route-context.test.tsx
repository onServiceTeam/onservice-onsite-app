import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockOpenConversation = jest.fn();
const mockGetMessagesPage = jest.fn();

// D38 Milestone 2 (package P5a): the chat opens its thread with
// openConversation (it used to list conversations and create one). The
// behaviour pinned here is unchanged: a link without a booking id never asks
// the server to open or create a thread.
jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));
jest.mock('@/stores/auth.store', () => ({ useAuthStore: (selector: (state: { user: null }) => unknown) => selector({ user: null }) }));
jest.mock('@/services/messaging.service', () => ({
  openConversation: (...args: unknown[]) => mockOpenConversation(...args),
  getMessagesPage: (...args: unknown[]) => mockGetMessagesPage(...args),
  getConversation: jest.fn(), sendChatMessage: jest.fn(), getInbox: jest.fn(),
  markConversationRead: jest.fn(), reportMessage: jest.fn(),
}));
jest.mock('@/services/booking.service', () => ({ getBookingById: jest.fn() }));
jest.mock('@/services/socket.service', () => ({
  subscribeSocketEvent: jest.fn(() => () => undefined), onSocketStatus: jest.fn(() => () => undefined), isSocketConnected: jest.fn(() => false),
  joinConversation: jest.fn(), leaveConversation: jest.fn(),
  emitTypingStart: jest.fn(), emitTypingStop: jest.fn(), emitMarkRead: jest.fn(),
}));
jest.mock('expo-image-picker', () => ({ requestMediaLibraryPermissionsAsync: jest.fn(), launchImageLibraryAsync: jest.fn() }));

import CustomerChatScreen from '../app/customer/chat/[id]';

it('Bug UX-635 — a chat link without a booking ID never attempts to create an unlinked conversation', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><CustomerChatScreen /></QueryClientProvider>);

  expect(screen.getByText('Booking chat unavailable')).toBeTruthy();
  await waitFor(() => expect(mockOpenConversation).not.toHaveBeenCalled());
  expect(mockGetMessagesPage).not.toHaveBeenCalled();
});
