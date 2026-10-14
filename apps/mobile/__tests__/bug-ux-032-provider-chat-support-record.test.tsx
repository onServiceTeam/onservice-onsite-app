import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// D38 Milestone 2 (package P5a): mocks follow the thread API (openConversation,
// getMessagesPage) and the shared socket registry; the copy pinned here is
// unchanged.
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'booking-1' }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 390, breakpoint: 'phone', isPhone: true, isTablet: false, isDesktop: false }),
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
    id: 'conversation-1', bookingId: 'booking-1', state: 'open', stateReason: null, stage: 'booking',
    otherParty: { userId: 'customer-user-1', displayName: 'Paolo G.', avatarUrl: null, role: 'customer' },
  }),
  getConversation: jest.fn(),
  getMessagesPage: jest.fn().mockResolvedValue({ messages: [], hasMore: false, nextBefore: null, conversation: null }),
  sendChatMessage: jest.fn(),
  getInbox: jest.fn(),
  markConversationRead: jest.fn().mockResolvedValue(undefined),
  reportMessage: jest.fn(),
}));
jest.mock('@/services/booking.service', () => ({
  getBookingById: jest.fn().mockResolvedValue({ customerName: 'Paolo Garcia' }),
}));
jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));

import ProviderChatScreen from '../app/provider/chat/[id]';

it('Bug UX-032 — provider chat explains that on-app messages give support a usable booking record', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><ProviderChatScreen /></QueryClientProvider>);

  expect(await screen.findByText(/On-app chat gives support the booking record/)).toBeTruthy();
});
