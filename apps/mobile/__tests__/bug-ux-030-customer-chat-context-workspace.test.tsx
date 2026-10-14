import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// D38 Milestone 2 (package P5a): the chat opens its thread with
// openConversation and reads cursor pages (getMessagesPage); the socket mock
// matches the shared listener registry. The behaviour pinned here is
// unchanged: the booking context sits beside the conversation on desktop.
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'booking-1' }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1100, breakpoint: 'desktop', isPhone: false, isTablet: false, isDesktop: true }),
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
    otherParty: { userId: 'provider-user-1', displayName: 'Cebu Prime Services', avatarUrl: null, role: 'provider' },
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
    id: 'booking-1',
    status: 'provider_en_route',
    serviceName: 'Aircon Cleaning',
    providerName: 'Cebu Prime Services',
    scheduledAt: '2026-08-24T01:00:00.000Z',
    address: '88 Banilad Road',
    barangay: 'Banilad',
    city: 'Mandaue City',
  }),
}));
jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));

import CustomerChatScreen from '../app/customer/chat/[id]';

it('Bug UX-030 — customer chat keeps booking status and actions visible beside the conversation', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><CustomerChatScreen /></QueryClientProvider>);

  const workspace = await screen.findByLabelText('Customer conversation workspace');
  const context = await screen.findByLabelText('Booking conversation context');
  expect(workspace.contains(context)).toBe(true);
  expect(await screen.findByText('Aircon Cleaning')).toBeTruthy();
  expect(context.textContent).toContain('Aircon Cleaning');
  expect(screen.getByText('View booking details')).toBeTruthy();
  expect(screen.getByText('Open booking tracker')).toBeTruthy();
});
