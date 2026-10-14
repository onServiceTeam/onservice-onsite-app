import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { getBookingById } from '@/services/booking.service';

// D38 Milestone 2 (package P5a): mocks follow the thread API (openConversation,
// getMessagesPage) and the shared socket registry. The booking record loads
// only for the booked pro's thread (stage 'booking', as here). The behaviour
// pinned here is unchanged.
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
  getMessagesPage: jest.fn().mockResolvedValue({ messages: [], hasMore: false, nextBefore: null, conversation: null }),
  sendChatMessage: jest.fn(), getInbox: jest.fn(),
  markConversationRead: jest.fn().mockResolvedValue(undefined), reportMessage: jest.fn(),
}));
jest.mock('@/services/booking.service', () => ({
  getBookingById: jest.fn().mockRejectedValue(new Error('booking unavailable')),
}));
jest.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: jest.fn(), launchImageLibraryAsync: jest.fn(),
}));

import ProviderChatScreen from '../app/provider/chat/[id]';

it('Bug UX-603 — failed provider chat job context has a direct desktop retry', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><ProviderChatScreen /></QueryClientProvider>);

  expect(await screen.findByText(/Job context is unavailable/i)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Retry loading job context' }));
  await waitFor(() => expect(getBookingById).toHaveBeenCalledTimes(2));
});
