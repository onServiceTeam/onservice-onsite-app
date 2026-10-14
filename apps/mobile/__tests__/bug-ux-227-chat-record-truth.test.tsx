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
  subscribeSocketEvent: () => () => undefined, onSocketStatus: () => () => undefined, isSocketConnected: () => true,
  joinConversation: jest.fn(), leaveConversation: jest.fn(), emitTypingStart: jest.fn(),
  emitTypingStop: jest.fn(), emitMarkRead: jest.fn(),
}));
jest.mock('@/services/messaging.service', () => ({
  openConversation: jest.fn().mockResolvedValue({
    id: 'conversation-1', bookingId: 'booking-1', state: 'open', stateReason: null, stage: 'booking',
    otherParty: { userId: 'provider-user-1', displayName: 'Cebu Prime Services', avatarUrl: null, role: 'provider' },
  }),
  getConversation: jest.fn(),
  getMessagesPage: jest.fn().mockResolvedValue({ messages: [], hasMore: false, nextBefore: null, conversation: null }),
  sendChatMessage: jest.fn(), getInbox: jest.fn(),
  markConversationRead: jest.fn().mockResolvedValue(undefined), reportMessage: jest.fn(),
}));
jest.mock('@/services/booking.service', () => ({
  getBookingById: jest.fn().mockResolvedValue({ id: 'booking-1', providerName: 'Cebu Prime Services' }),
}));
jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(), launchImageLibraryAsync: jest.fn(),
}));

import CustomerChatScreen from '../app/customer/chat/[id]';

it('Bug UX-227 — customer chat explains its support evidence value without advertising a deferred service guarantee', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><CustomerChatScreen /></QueryClientProvider>);

  expect(await screen.findByText(/On-app chat stays attached to the booking/i)).toBeTruthy();
  expect(screen.getByText(/support can review the service record and any dispute evidence/i)).toBeTruthy();
  expect(screen.queryByText(/service guarantee/i)).toBeNull();
});
