import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { getMessagesPage } from '@/services/messaging.service';

// D38 Milestone 2 (package P5a): the history is read with cursor pages
// (getMessagesPage) through the shared ChatThread. The behaviour pinned here
// is unchanged: a failed history is an error with a retry, never an empty
// "Start the conversation".
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({ id: 'booking-1' }),
}));
jest.mock('@/hooks/useResponsive', () => ({
  useResponsive: () => ({ width: 1100, breakpoint: 'desktop', isPhone: false, isTablet: false, isDesktop: true }),
}));
jest.mock('@/services/socket.service', () => ({
  subscribeSocketEvent: () => () => undefined, onSocketStatus: () => () => undefined, isSocketConnected: () => true,
  joinConversation: jest.fn(), leaveConversation: jest.fn(), emitTypingStart: jest.fn(),
  emitTypingStop: jest.fn(), emitMarkRead: jest.fn(),
}));
jest.mock('@/services/messaging.service', () => ({
  openConversation: jest.fn().mockResolvedValue({
    id: 'conversation-1', bookingId: 'booking-1', state: 'open', stateReason: null, stage: 'booking',
    otherParty: { userId: 'customer-user-1', displayName: 'Paolo G.', avatarUrl: null, role: 'customer' },
  }),
  getConversation: jest.fn(),
  getMessagesPage: jest.fn().mockRejectedValue(new Error('history unavailable')),
  sendChatMessage: jest.fn(), getInbox: jest.fn(),
  markConversationRead: jest.fn().mockResolvedValue(undefined), reportMessage: jest.fn(),
}));
jest.mock('@/services/booking.service', () => ({
  getBookingById: jest.fn().mockResolvedValue({
    id: 'booking-1', status: 'in_progress', serviceName: 'Aircon Cleaning', customerName: 'Paolo Garcia',
    scheduledAt: '2026-08-24T01:00:00.000Z', address: '88 Banilad Road', city: 'Mandaue City',
  }),
}));
jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(), launchImageLibraryAsync: jest.fn(),
}));

import ProviderChatScreen from '../app/provider/chat/[id]';

it('Bug UX-591 — failed provider message history is not presented as a new empty conversation', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><ProviderChatScreen /></QueryClientProvider>);

  expect(await screen.findByText('Conversation history unavailable')).toBeTruthy();
  expect(screen.queryByText('Start the conversation')).toBeNull();

  fireEvent.click(screen.getByRole('button', { name: 'Retry loading' }));
  await waitFor(() => expect(getMessagesPage).toHaveBeenCalledTimes(2));
});
