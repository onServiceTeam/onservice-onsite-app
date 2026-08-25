import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { reportMessage } from '@/services/messaging.service';

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn(), back: jest.fn() }), useLocalSearchParams: () => ({ id: 'booking-1' }) }));
jest.mock('@/hooks/useResponsive', () => ({ useResponsive: () => ({ width: 1100, breakpoint: 'desktop', isPhone: false, isTablet: false, isDesktop: true }) }));
jest.mock('@/stores/auth.store', () => ({ useAuthStore: (selector: (state: unknown) => unknown) => selector({ user: { id: 'customer-1' } }) }));
jest.mock('@/services/socket.service', () => ({
  connectSocket: () => ({ on: jest.fn() }), getSocket: () => null, joinConversation: jest.fn(), leaveConversation: jest.fn(),
  emitTypingStart: jest.fn(), emitTypingStop: jest.fn(), emitMarkRead: jest.fn(),
}));
jest.mock('@/services/messaging.service', () => ({
  getConversations: jest.fn().mockResolvedValue([{ id: 'conversation-1', bookingId: 'booking-1' }]), createConversation: jest.fn(),
  getMessages: jest.fn().mockResolvedValue({ messages: [{ id: 'message-1', conversationId: 'conversation-1', senderId: 'provider-1', messageType: 'text', content: 'Please pay me outside the app.', imageUrl: null, isRead: false, createdAt: '2026-08-25T00:00:00.000Z' }], total: 1 }),
  sendMessage: jest.fn(), markConversationRead: jest.fn().mockResolvedValue(undefined), reportMessage: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('@/services/booking.service', () => ({ getBookingById: jest.fn().mockResolvedValue({ id: 'booking-1', status: 'in_progress', serviceName: 'Cleaning', providerName: 'Provider One', scheduledAt: '2026-08-25T01:00:00.000Z', address: '1 Test Street', barangay: 'Lahug', city: 'Cebu City' }) }));
jest.mock('expo-image-picker', () => ({ requestMediaLibraryPermissionsAsync: jest.fn(), launchImageLibraryAsync: jest.fn() }));

import CustomerChatScreen from '../app/customer/chat/[id]';

it('Bug UX-394 — desktop chat exposes a visible message-report action and an in-app reason picker linked to moderation', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}><CustomerChatScreen /></QueryClientProvider>);

  fireEvent.click(await screen.findByRole('button', { name: 'Report this message' }));
  expect(screen.getByRole('alert', { name: 'Report message reason' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Report reason scam or off-app payment request' }));
  await waitFor(() => expect(reportMessage).toHaveBeenCalledWith('message-1', 'scam_or_off_platform'));
});
